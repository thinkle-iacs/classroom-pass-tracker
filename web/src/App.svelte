<script lang="ts">
  // Placeholder shell. `/kiosk` becomes the classroom display, `/` the teacher dashboard.
  // See docs/ARCHITECTURE.md -> Teacher dashboard / Kiosk.
  import { Container } from 'contain-css-svelte';
  const isKiosk = location.pathname.startsWith('/kiosk');
</script>

<Container>
  <h1>{isKiosk ? 'Classroom display' : 'Pass Tracker'}</h1>
  <p>Not built yet.</p>
</Container>
