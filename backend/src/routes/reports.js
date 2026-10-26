import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, dateSchema, idSchema } from '../utils/http.js';
import { badRequest } from '../utils/errors.js';
import { getDashboard } from '../services/dashboard.js';
import { buildReport, reportBuilders } from '../services/reports.js';
import { toExcel, toPdf } from '../services/export.js';
import { getSettings } from '../services/common.js';

export const dashboardRouter = Router();
const periodQuery = z.object({ from: dateSchema.optional(), to: dateSchema.optional() });

dashboardRouter.get('/', asyncHandler(async (req, res) => {
  res.json(await getDashboard(periodQuery.parse(req.query)));
}));

export const reportsRouter = Router();
const reportQuery = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  customer_id: idSchema.optional(),
  supplier_id: idSchema.optional(),
  format: z.enum(['xlsx', 'pdf']).optional(),
});

reportsRouter.get('/:name', asyncHandler(async (req, res) => {
  if (!reportBuilders[req.params.name]) throw badRequest('Unknown report');
  const { format, ...params } = reportQuery.parse(req.query);
  res.json(await buildReport(req.params.name, params));
}));

reportsRouter.get('/:name/export', asyncHandler(async (req, res) => {
  if (!reportBuilders[req.params.name]) throw badRequest('Unknown report');
  const { format = 'xlsx', ...params } = reportQuery.parse(req.query);
  const report = await buildReport(req.params.name, params);
  const settings = await getSettings();
  const context = { currency: settings.currency, shopName: settings.shop_name };
  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `${req.params.name}-${stamp}.${format}`;

  if (format === 'pdf') {
    res.type('application/pdf');
    res.set('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(await toPdf(report, context));
  }
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(await toExcel(report, context));
}));
