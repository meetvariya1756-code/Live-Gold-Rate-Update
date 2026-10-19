module.exports = {
  apps: [
    {
      name: 'live-gold-feed',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      instances: 1, // Single instance to prevent DB connection pool multiplication on shared VPS
      autorestart: true,
      watch: false,
      max_memory_restart: '1200M', // Automatically recycle if memory exceeds 1.2GB, preventing Linux OOM lockup
      node_args: '--max-old-space-size=1536',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
