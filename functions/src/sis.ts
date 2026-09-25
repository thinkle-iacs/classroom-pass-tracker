import { HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { FIXTURE_CLASSES, FIXTURE_ROSTERS } from '@pass/shared/fixtures';

// The trusted SIS boundary. Aspen identifiers returned from here must never be
// written anywhere a kiosk can read. See identity.ts.

const idSchema = z.string().min(1).max(256).regex(/^[a-zA-Z0-9_+@.:-]+$/);
export const sisClassSchema = z.object({
  sourcedId: idSchema,
  status: z.string().optional(),
  title: z.string(),
  classCode: z.string().nullable().optional(),
  grades: z.array(z.string()).nullable().optional(),
  periods: z.array(z.string()).nullable().optional(),
}).passthrough();
export type SisClass = z.infer<typeof sisClassSchema>;

export const sisStudentSchema = z.object({
  sourcedId: idSchema,
  status: z.string().optional(),
  enabledUser: z.union([z.boolean(), z.string()]).optional(),
  givenName: z.string().default(''),
  familyName: z.string().default(''),
  role: z.string().optional(),
}).passthrough();
export type SisStudent = z.infer<typeof sisStudentSchema>;

export interface SisSource {
  /** The teacher's classes. Throws permission-denied unless the email maps to exactly one active teacher. */
  classesForTeacher(email: string): Promise<SisClass[]>;
  /** Students enrolled in a class the caller already obtained from classesForTeacher. */
  students(classId: string): Promise<SisStudent[]>;
}

export interface OneRosterConfig { baseUrl: string; tokenUrl: string; clientId: string; clientSecret: string }
const teacherSchema = z.object({ sourcedId: idSchema, email: z.string(), enabledUser: z.union([z.boolean(), z.string()]).optional(), status: z.string().optional() });

// Adapted from google-classroom-sync-web/functions/src/oneroster.ts (read-only subset).
// Fetch is injected for tests.
export class OneRosterSource implements SisSource {
  private token = '';
  private readonly base: URL;
  constructor(private readonly config: OneRosterConfig, private readonly fetcher: typeof fetch = fetch) {
    this.base = new URL(config.baseUrl.replace(/\/?$/, '/'));
    const tokenUrl = new URL(config.tokenUrl);
    if (this.base.protocol !== 'https:' || tokenUrl.protocol !== 'https:' || this.base.origin !== tokenUrl.origin) {
      throw new Error('OneRoster endpoints must use HTTPS on the configured SIS origin');
    }
  }
  private async accessToken() {
    if (this.token) return this.token;
    const response = await this.fetcher(this.config.tokenUrl, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: this.config.clientId, client_secret: this.config.clientSecret }),
    });
    if (!response.ok) throw new HttpsError('unavailable', 'Unable to authenticate with Aspen.');
    this.token = z.object({ access_token: z.string().min(1) }).parse(await response.json()).access_token;
    return this.token;
  }
  private resolve(path: string, query: Record<string, string> = {}): URL {
    const url = new URL(path, this.base);
    if (url.origin !== this.base.origin || !url.pathname.startsWith(this.base.pathname)) throw new Error('Invalid SIS path');
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
    return url;
  }
  private async read(path: string, query: Record<string, string> = {}): Promise<unknown> {
    const response = await this.fetcher(this.resolve(path, query), {
      redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Accept: 'application/json', Authorization: `Bearer ${await this.accessToken()}` },
    });
    if (!response.ok) throw new HttpsError('unavailable', `Aspen request failed (${response.status}).`);
    return response.json();
  }
  private async pages<T>(path: string, key: string, schema: z.ZodType<T>, query: Record<string, string> = {}): Promise<T[]> {
    const results: T[] = [];
    // Aspen's OneRoster 1.1 API uses limit/offset pagination.
    for (let offset = 0; offset < 100000; offset += 100) {
      const body = await this.read(path, { ...query, limit: '100', offset: String(offset) });
      const envelope = z.record(z.string(), z.unknown()).parse(body);
      const page = z.array(schema).parse(envelope[key]);
      results.push(...page);
      if (page.length < 100) return results;
    }
    throw new HttpsError('resource-exhausted', 'Aspen returned too many pages.');
  }
  async classesForTeacher(email: string): Promise<SisClass[]> {
    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+$/i.test(email)) throw new HttpsError('permission-denied', 'Invalid school identity.');
    const teachers = await this.pages('teachers', 'users', teacherSchema, { filter: `email='${email}'` });
    const matches = teachers.filter((t) => t.email.toLowerCase() === email.toLowerCase() && isActive(t));
    if (matches.length !== 1) throw new HttpsError('permission-denied', 'Your account must match one active Aspen teacher.');
    return this.pages(`teachers/${encodeURIComponent(matches[0]!.sourcedId)}/classes`, 'classes', sisClassSchema);
  }
  async students(classId: string): Promise<SisStudent[]> {
    return this.pages(`classes/${encodeURIComponent(classId)}/students`, 'users', sisStudentSchema);
  }
}

export function isActive(record: { status?: string; enabledUser?: boolean | string }): boolean {
  return record.status !== 'tobedeleted' && record.enabledUser !== false && record.enabledUser !== 'false';
}

/** Synthetic data for emulators and cloud sessions. Any signed-in teacher gets the same classes. */
export class FixtureSource implements SisSource {
  async classesForTeacher(): Promise<SisClass[]> { return FIXTURE_CLASSES.map((c) => ({ ...c })); }
  async students(classId: string): Promise<SisStudent[]> { return (FIXTURE_ROSTERS[classId] ?? []).map((s) => ({ ...s })); }
}
