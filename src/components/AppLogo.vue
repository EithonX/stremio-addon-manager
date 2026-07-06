<script setup>
</script>

<template>
  <svg
    viewBox="0 0 40 40"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="appLogoTile" x1="6" y1="4" x2="34" y2="36" gradientUnits="userSpaceOnUse">
        <stop stop-color="#3B82F6" />
        <stop offset="1" stop-color="#2563EB" />
      </linearGradient>
    </defs>

    <rect x="0" y="0" width="40" height="40" rx="11" fill="url(#appLogoTile)" />

    <rect x="7.5" y="7.5" width="7" height="7" rx="2" fill="#FFFFFF" fill-opacity="0.28" />
    <rect x="25.5" y="25.5" width="7" height="7" rx="2" fill="#FFFFFF" fill-opacity="0.28" />

    <path
      d="M17 13.5 L28 20 L17 26.5 Z"
      fill="#FFFFFF"
      stroke="#FFFFFF"
      stroke-width="2.6"
      stroke-linejoin="round"
      stroke-linecap="round"
    />
  </svg>
</template>