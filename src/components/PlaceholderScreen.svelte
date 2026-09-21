<script lang="ts">
  import Heading from './Heading.svelte';

  // Stands in for screens that later groups of this change add.
  let { name }: { name: string } = $props();
</script>

<section class="space-y-3">
  <Heading>{name}</Heading>
</section>
