import { createApp } from './app.js';

const PORT = parseInt(process.env.PORT || '3000', 10);

const app = createApp();

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

app.listen(PORT, () => {
  console.log(`MedPortal API running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
