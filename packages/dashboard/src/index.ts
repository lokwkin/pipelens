import { DashboardServer } from './dashboard-server';

// Create and start the dashboard server
const server = new DashboardServer({
  port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
});

server.start(); 