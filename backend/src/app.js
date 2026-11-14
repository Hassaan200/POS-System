import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import authRouter from './routes/auth.js';
import catalogRouter from './routes/catalog.js';
import productsRouter from './routes/products.js';
import settingsRouter from './routes/settings.js';
import { customersRouter, suppliersRouter } from './routes/parties.js';
import { paymentsRouter, purchasesRouter, salesRouter } from './routes/transactions.js';
import { dashboardRouter, reportsRouter } from './routes/reports.js';
import { expensesRouter } from './routes/expenses.js';
import { clearingRouter } from './routes/clearing.js';
import { containersRouter } from './routes/containers.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({
    origin: env.corsOrigin.length ? env.corsOrigin : false,
    exposedHeaders: ['Content-Disposition'],
  }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter);

  app.use('/api', requireAuth);
  app.use('/api/catalog', catalogRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/customers', customersRouter);
  app.use('/api/suppliers', suppliersRouter);
  app.use('/api/purchases', purchasesRouter);
  app.use('/api/sales', salesRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/expenses', expensesRouter);
  app.use('/api/clearing', clearingRouter);
  app.use('/api/containers', containersRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/settings', settingsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
// === YEH LINE FILE KE END MEIN Vercel host ke lye ADD Kari hai ===
const app = createApp();
export default app;