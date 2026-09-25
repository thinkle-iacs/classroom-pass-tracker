<script lang="ts">
  // Two routes, no router: `/kiosk` is the classroom display, everything else the teacher dashboard.
  import KioskPage from './kiosk/KioskPage.svelte';
  import DashboardPage from './teacher/DashboardPage.svelte';
  const isKiosk = location.pathname.startsWith('/kiosk');
</script>

{#if isKiosk}
  <KioskPage />
{:else}
  <DashboardPage />
{/if}
