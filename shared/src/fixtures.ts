// Synthetic OneRoster-shaped data. Every name here is invented. Used by the
// fixture SIS transport (emulators, cloud sessions, tests) -- never real records.

export interface FixtureClass {
  sourcedId: string; title: string; classCode: string; grades: string[]; periods: string[]; status: string;
}
export interface FixtureStudent { sourcedId: string; givenName: string; familyName: string; email: string; role: 'student' }

const GIVEN = ['Maya', 'Finn', 'Alex', 'Priya', 'Jonah', 'Sofia', 'Mateo', 'Ava', 'Kai', 'Lena', 'Omar', 'Zoe', 'Theo', 'Nia', 'Eli', 'Rosa', 'Sam', 'Ivy', 'Leo', 'Maya'];
const FAMILY = ['Rivera', 'Sato', 'Park', 'Nair', 'Brooks', 'Costa', 'Silva', 'Chen', 'Okafor', 'Lind', 'Haddad', 'Quinn', 'Moreau', 'Adeyemi', 'Frost', 'Ortiz', 'Kim', 'Novak', 'Grant', 'Romero'];

export const FIXTURE_CLASSES: FixtureClass[] = [
  { sourcedId: 'fx-class-eng10-b1', title: 'English 10', classCode: 'ENG10-01', grades: ['10'], periods: ['Block 1(D1,D2,D4,D5)'], status: 'active' },
  { sourcedId: 'fx-class-eng10-b2', title: 'English 10', classCode: 'ENG10-02', grades: ['10'], periods: ['Block 2(D1,D3,D5)'], status: 'active' },
  { sourcedId: 'fx-class-jour-b3', title: 'Journalism', classCode: 'JOUR-01', grades: ['11', '12'], periods: ['Block 3(D1,D2,D3,D4)'], status: 'active' },
  { sourcedId: 'fx-class-eng10-b4', title: 'English 10', classCode: 'ENG10-03', grades: ['10'], periods: ['Block 4(D1,D2,D4,D5)'], status: 'active' },
  { sourcedId: 'fx-class-ela7-c', title: 'ELA Grade 7', classCode: 'ELA7-C', grades: ['07'], periods: ['BLOCK 3(Mon-Tues) BLOCK 6(Thur-Fri)'], status: 'active' },
];

function studentsFor(classIndex: number, count: number): FixtureStudent[] {
  return Array.from({ length: count }, (_, i) => {
    const n = (classIndex * 7 + i) % GIVEN.length;
    const f = (classIndex * 3 + i * 5) % FAMILY.length;
    const id = `fx-stu-${classIndex}-${i}`;
    return { sourcedId: id, givenName: GIVEN[n]!, familyName: FAMILY[f]!, email: `${id}@students.example.org`, role: 'student' };
  });
}

export const FIXTURE_ROSTERS: Record<string, FixtureStudent[]> = Object.fromEntries(
  FIXTURE_CLASSES.map((c, i) => [c.sourcedId, studentsFor(i, 14 + (i % 3) * 3)]),
);
