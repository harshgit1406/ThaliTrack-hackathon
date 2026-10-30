import type { FastifyInstance, FastifyRequest } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { hashToken, newOpaqueToken, requirePermission } from "../auth.js";
import { transaction } from "../database.js";
import { AppError } from "../errors.js";

const code = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .transform((value) => value.toUpperCase().replace(/[^A-Z0-9_-]+/g, "_"));
const status = <T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values);
export const businessHoursSchema = z.object({
  days: z
    .array(
      z.object({
        day_of_week: z.number().int().min(0).max(6),
        is_open: z.boolean(),
        opens_at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        closes_at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        ordering_opens_minutes_before: z
          .number()
          .int()
          .min(0)
          .max(1440)
          .default(0),
        ordering_closes_minutes_before: z
          .number()
          .int()
          .min(0)
          .max(1440)
          .default(0),
      }),
    )
    .length(7)
    .refine(
      (days) => new Set(days.map((day) => day.day_of_week)).size === 7,
      "Include each day exactly once.",
    )
    .refine(
      (days) => days.every((day) => day.opens_at !== day.closes_at),
      "Opening and closing times must be different.",
    ),
});
const taxSchema = z.object({
  code,
  name: z.string().trim().min(1).max(120),
  authority: z.string().trim().max(120).optional(),
  rate_percent: z.number().min(0).max(100),
  price_inclusive: z.boolean().default(false),
  status: status(["active", "inactive"] as const).default("active"),
  tax_category_ids: z.array(z.string().uuid()).default([]),
});
const terminalSchema = z.object({
  code,
  name: z.string().trim().min(1).max(120),
  counter_id: z.string().uuid().nullable().optional(),
  status: status(["pending", "active", "blocked", "retired"] as const).default(
    "active",
  ),
});
const stationSchema = z.object({
  code,
  name: z.string().trim().min(1).max(120),
  status: status(["active", "inactive", "archived"] as const).default("active"),
});
const printerSchema = z.object({
  code,
  name: z.string().trim().min(1).max(120),
  printer_type: status([
    "network",
    "usb",
    "bluetooth",
    "system",
    "cloud",
  ] as const).default("system"),
  queue: z.string().trim().min(1).max(300),
  paper_width_mm: z
    .union([z.literal(58), z.literal(76), z.literal(80)])
    .default(80),
  status: status(["active", "offline", "disabled", "retired"] as const).default(
    "active",
  ),
});
const routeSchema = z.object({
  printer_id: z.string().uuid(),
  document_type: status([
    "kot",
    "bill",
    "receipt",
    "token",
    "summary",
  ] as const),
  kitchen_station_id: z.string().uuid().nullable().optional(),
  terminal_id: z.string().uuid().nullable().optional(),
  copies: z.number().int().min(1).max(10).default(1),
});
const gatewaySchema = z.object({
  gateway_key: code,
  display_name: z.string().trim().min(1).max(120),
});

async function outletScope(pool: pg.Pool, outletId: string): Promise<string> {
  const result = await pool.query<{ canteen_id: string }>(
    `
    SELECT link.canteen_id FROM mealy.outlets outlet
    JOIN mealy.campus_canteens link ON link.id = outlet.campus_canteen_id
    WHERE outlet.id = $1 AND outlet.archived_at IS NULL
  `,
    [outletId],
  );
  if (!result.rows[0])
    throw new AppError("OUTLET_NOT_FOUND", "Outlet was not found.", 404);
  return result.rows[0].canteen_id;
}

async function audit(
  client: pg.PoolClient,
  request: FastifyRequest,
  input: {
    action: string;
    entityType: string;
    entityId: string;
    canteenId: string;
    outletId?: string;
    after: unknown;
  },
): Promise<void> {
  const principal = request.principal!;
  await client.query(
    `
    INSERT INTO mealy.audit_logs (actor_user_id, actor_type, action, entity_type, entity_id, canteen_id, outlet_id, after_data, request_id, ip_address, user_agent)
    VALUES ($1,'staff',$2,$3,$4,$5,$6,$7,$8,$9,$10)
  `,
    [
      principal.userId,
      input.action,
      input.entityType,
      input.entityId,
      input.canteenId,
      input.outletId ?? null,
      input.after,
      request.id,
      request.ip,
      request.headers["user-agent"] ?? null,
    ],
  );
}

export async function registerManagementSetupRoutes(
  app: FastifyInstance,
  pool: pg.Pool,
): Promise<void> {
  app.get<{ Params: { canteenId: string } }>(
    "/v1/management/canteens/:canteenId/setup",
    async (request) => {
      const canteenId = z.string().uuid().parse(request.params.canteenId);
      requirePermission(request, "catalog.read", { canteenId });
      const [
        hours,
        counters,
        taxes,
        categories,
        terminals,
        stations,
        printers,
        routes,
        gateways,
      ] = await Promise.all([
        pool.query(
          `SELECT hours.* FROM mealy.outlet_business_hours hours JOIN mealy.outlets outlet ON outlet.id = hours.outlet_id JOIN mealy.campus_canteens link ON link.id = outlet.campus_canteen_id WHERE link.canteen_id = $1 AND hours.service_type = 'pickup' ORDER BY hours.outlet_id, hours.day_of_week`,
          [canteenId],
        ),
        pool.query(
          `SELECT counter.id, counter.outlet_id, counter.code, counter.name, counter.status FROM mealy.service_counters counter JOIN mealy.outlets outlet ON outlet.id = counter.outlet_id JOIN mealy.campus_canteens link ON link.id = outlet.campus_canteen_id WHERE link.canteen_id = $1 AND counter.status <> 'archived' ORDER BY counter.name`,
          [canteenId],
        ),
        pool.query(
          `SELECT rate.*, COALESCE(array_agg(link.tax_category_id) FILTER (WHERE link.tax_category_id IS NOT NULL), '{}') AS tax_category_ids FROM mealy.tax_rates rate LEFT JOIN mealy.tax_category_rates link ON link.tax_rate_id = rate.id WHERE rate.canteen_id = $1 AND rate.status <> 'archived' GROUP BY rate.id ORDER BY rate.name`,
          [canteenId],
        ),
        pool.query(
          `SELECT id, code, name FROM mealy.tax_categories WHERE canteen_id = $1 ORDER BY name`,
          [canteenId],
        ),
        pool.query(
          `SELECT terminal.id, terminal.outlet_id, terminal.counter_id, terminal.code, terminal.name, terminal.status, terminal.last_seen_at, terminal.app_version FROM mealy.pos_terminals terminal JOIN mealy.outlets outlet ON outlet.id = terminal.outlet_id JOIN mealy.campus_canteens link ON link.id = outlet.campus_canteen_id WHERE link.canteen_id = $1 ORDER BY terminal.name`,
          [canteenId],
        ),
        pool.query(
          `SELECT station.id, station.outlet_id, station.code, station.name, station.status, station.display_order FROM mealy.kitchen_stations station JOIN mealy.outlets outlet ON outlet.id = station.outlet_id JOIN mealy.campus_canteens link ON link.id = outlet.campus_canteen_id WHERE link.canteen_id = $1 ORDER BY station.display_order, station.name`,
          [canteenId],
        ),
        pool.query(
          `SELECT printer.id, printer.outlet_id, printer.code, printer.name, printer.printer_type, printer.connection_config, printer.paper_width_mm, printer.status, printer.last_seen_at FROM mealy.printers printer JOIN mealy.outlets outlet ON outlet.id = printer.outlet_id JOIN mealy.campus_canteens link ON link.id = outlet.campus_canteen_id WHERE link.canteen_id = $1 ORDER BY printer.name`,
          [canteenId],
        ),
        pool.query(
          `SELECT route.* FROM mealy.printer_routes route JOIN mealy.outlets outlet ON outlet.id = route.outlet_id JOIN mealy.campus_canteens link ON link.id = outlet.campus_canteen_id WHERE link.canteen_id = $1 ORDER BY route.document_type, route.priority`,
          [canteenId],
        ),
        pool.query(
          `SELECT gateway.id, gateway.outlet_id, gateway.gateway_key, gateway.display_name, gateway.status, gateway.last_connected_at, gateway.last_seen_at, gateway.app_version FROM mealy.outlet_gateways gateway JOIN mealy.outlets outlet ON outlet.id = gateway.outlet_id JOIN mealy.campus_canteens link ON link.id = outlet.campus_canteen_id WHERE link.canteen_id = $1 ORDER BY gateway.display_name`,
          [canteenId],
        ),
      ]);
      return {
        data: {
          business_hours: hours.rows,
          counters: counters.rows,
          tax_rates: taxes.rows,
          tax_categories: categories.rows,
          terminals: terminals.rows,
          kitchen_stations: stations.rows,
          printers: printers.rows,
          printer_routes: routes.rows,
          gateways: gateways.rows,
        },
      };
    },
  );

  app.put<{ Params: { outletId: string } }>(
    "/v1/management/outlets/:outletId/business-hours",
    async (request) => {
      const outletId = z.string().uuid().parse(request.params.outletId);
      const input = businessHoursSchema.parse(request.body);
      const canteenId = await outletScope(pool, outletId);
      const principal = requirePermission(request, "outlet.manage", {
        canteenId,
        outletId,
      });
      await transaction(pool, async (client) => {
        await client.query(
          "DELETE FROM mealy.outlet_business_hours WHERE outlet_id = $1 AND service_type = 'pickup'",
          [outletId],
        );
        for (const day of input.days) {
          await client.query(
            `INSERT INTO mealy.outlet_business_hours (outlet_id, day_of_week, service_type, opens_at, closes_at, ordering_opens_minutes_before, ordering_closes_minutes_before, is_active) VALUES ($1,$2,'pickup',$3,$4,$5,$6,$7)`,
            [
              outletId,
              day.day_of_week,
              day.opens_at,
              day.closes_at,
              day.ordering_opens_minutes_before,
              day.ordering_closes_minutes_before,
              day.is_open,
            ],
          );
        }
        request.principal = principal;
        await audit(client, request, {
          action: "outlet.business_hours_updated",
          entityType: "outlet",
          entityId: outletId,
          canteenId,
          outletId,
          after: input,
        });
      });
      return { data: { outlet_id: outletId, days: input.days } };
    },
  );

  const saveTax = async (
    request: FastifyRequest,
    canteenId: string,
    taxId: string | undefined,
  ) => {
    const input = taxSchema.parse(request.body);
    const principal = requirePermission(request, "catalog.manage", {
      canteenId,
    });
    return transaction(pool, async (client) => {
      if (input.tax_category_ids.length) {
        const valid = await client.query(
          `SELECT id FROM mealy.tax_categories WHERE canteen_id = $1 AND id = ANY($2::uuid[])`,
          [canteenId, input.tax_category_ids],
        );
        if (valid.rowCount !== input.tax_category_ids.length)
          throw new AppError(
            "TAX_CATEGORY_INVALID",
            "One or more tax categories are outside this canteen.",
            400,
          );
      }
      const saved = taxId
        ? await client.query(
            `UPDATE mealy.tax_rates SET code=$3,name=$4,authority=$5,rate_basis_points=$6,price_inclusive=$7,status=$8,updated_at=now() WHERE id=$1 AND canteen_id=$2 AND status <> 'archived' RETURNING *`,
            [
              taxId,
              canteenId,
              input.code,
              input.name,
              input.authority ?? null,
              Math.round(input.rate_percent * 100),
              input.price_inclusive,
              input.status,
            ],
          )
        : await client.query(
            `INSERT INTO mealy.tax_rates (canteen_id,code,name,authority,rate_basis_points,price_inclusive,status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
            [
              canteenId,
              input.code,
              input.name,
              input.authority ?? null,
              Math.round(input.rate_percent * 100),
              input.price_inclusive,
              input.status,
            ],
          );
      if (!saved.rows[0])
        throw new AppError(
          "TAX_RATE_NOT_FOUND",
          "Tax rate was not found.",
          404,
        );
      await client.query(
        "DELETE FROM mealy.tax_category_rates WHERE tax_rate_id = $1",
        [saved.rows[0].id],
      );
      for (const categoryId of input.tax_category_ids)
        await client.query(
          "INSERT INTO mealy.tax_category_rates (tax_category_id, tax_rate_id) VALUES ($1,$2)",
          [categoryId, saved.rows[0].id],
        );
      request.principal = principal;
      await audit(client, request, {
        action: taxId ? "tax.rate_updated" : "tax.rate_created",
        entityType: "tax_rate",
        entityId: saved.rows[0].id,
        canteenId,
        after: {
          ...input,
          rate_basis_points: Math.round(input.rate_percent * 100),
        },
      });
      return saved.rows[0];
    });
  };
  app.post<{ Params: { canteenId: string } }>(
    "/v1/management/canteens/:canteenId/tax-rates",
    async (request, reply) =>
      reply
        .status(201)
        .send({
          data: {
            tax_rate: await saveTax(
              request,
              z.string().uuid().parse(request.params.canteenId),
              undefined,
            ),
          },
        }),
  );
  app.put<{ Params: { canteenId: string; taxId: string } }>(
    "/v1/management/canteens/:canteenId/tax-rates/:taxId",
    async (request) => ({
      data: {
        tax_rate: await saveTax(
          request,
          z.string().uuid().parse(request.params.canteenId),
          z.string().uuid().parse(request.params.taxId),
        ),
      },
    }),
  );

  app.post<{ Params: { outletId: string } }>(
    "/v1/management/outlets/:outletId/terminals",
    async (request, reply) => {
      const outletId = z.string().uuid().parse(request.params.outletId);
      const input = terminalSchema.parse(request.body);
      const canteenId = await outletScope(pool, outletId);
      const principal = requirePermission(request, "outlet.manage", {
        canteenId,
        outletId,
      });
      const terminal = await transaction(pool, async (client) => {
        if (input.counter_id) {
          const found = await client.query(
            "SELECT 1 FROM mealy.service_counters WHERE id=$1 AND outlet_id=$2",
            [input.counter_id, outletId],
          );
          if (!found.rows[0])
            throw new AppError(
              "COUNTER_NOT_FOUND",
              "Counter was not found for this outlet.",
              404,
            );
        }
        const saved = await client.query(
          `INSERT INTO mealy.pos_terminals (outlet_id,counter_id,code,name,status) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [
            outletId,
            input.counter_id ?? null,
            input.code,
            input.name,
            input.status,
          ],
        );
        request.principal = principal;
        await audit(client, request, {
          action: "device.terminal_enrolled",
          entityType: "pos_terminal",
          entityId: saved.rows[0].id,
          canteenId,
          outletId,
          after: input,
        });
        return saved.rows[0];
      });
      return reply.status(201).send({ data: { terminal } });
    },
  );
  app.put<{ Params: { outletId: string; terminalId: string } }>(
    "/v1/management/outlets/:outletId/terminals/:terminalId",
    async (request) => {
      const outletId = z.string().uuid().parse(request.params.outletId);
      const terminalId = z.string().uuid().parse(request.params.terminalId);
      const input = terminalSchema.parse(request.body);
      const canteenId = await outletScope(pool, outletId);
      const principal = requirePermission(request, "outlet.manage", {
        canteenId,
        outletId,
      });
      const terminal = await transaction(pool, async (client) => {
        if (input.counter_id) {
          const counter = await client.query(
            "SELECT 1 FROM mealy.service_counters WHERE id=$1 AND outlet_id=$2",
            [input.counter_id, outletId],
          );
          if (!counter.rows[0])
            throw new AppError(
              "COUNTER_NOT_FOUND",
              "Counter was not found for this outlet.",
              404,
            );
        }
        const saved = await client.query(
          `UPDATE mealy.pos_terminals SET counter_id=$3,code=$4,name=$5,status=$6,updated_at=now() WHERE id=$1 AND outlet_id=$2 RETURNING *`,
          [
            terminalId,
            outletId,
            input.counter_id ?? null,
            input.code,
            input.name,
            input.status,
          ],
        );
        if (!saved.rows[0])
          throw new AppError(
            "TERMINAL_NOT_FOUND",
            "Terminal was not found.",
            404,
          );
        request.principal = principal;
        await audit(client, request, {
          action: "device.terminal_updated",
          entityType: "pos_terminal",
          entityId: terminalId,
          canteenId,
          outletId,
          after: input,
        });
        return saved.rows[0];
      });
      return { data: { terminal } };
    },
  );

  app.post<{ Params: { outletId: string } }>(
    "/v1/management/outlets/:outletId/kitchen-stations",
    async (request, reply) => {
      const outletId = z.string().uuid().parse(request.params.outletId);
      const input = stationSchema.parse(request.body);
      const canteenId = await outletScope(pool, outletId);
      const principal = requirePermission(request, "outlet.manage", {
        canteenId,
        outletId,
      });
      const saved = await transaction(pool, async (client) => {
        const result = await client.query(
          `INSERT INTO mealy.kitchen_stations (outlet_id,code,name,status,display_order) VALUES ($1,$2,$3,$4,(SELECT COALESCE(max(display_order),-1)+1 FROM mealy.kitchen_stations WHERE outlet_id=$1)) RETURNING *`,
          [outletId, input.code, input.name, input.status],
        );
        request.principal = principal;
        await audit(client, request, {
          action: "kitchen.station_created",
          entityType: "kitchen_station",
          entityId: result.rows[0].id,
          canteenId,
          outletId,
          after: input,
        });
        return result.rows[0];
      });
      return reply.status(201).send({ data: { kitchen_station: saved } });
    },
  );
  app.put<{ Params: { outletId: string; stationId: string } }>(
    "/v1/management/outlets/:outletId/kitchen-stations/:stationId",
    async (request) => {
      const outletId = z.string().uuid().parse(request.params.outletId);
      const stationId = z.string().uuid().parse(request.params.stationId);
      const input = stationSchema.parse(request.body);
      const canteenId = await outletScope(pool, outletId);
      const principal = requirePermission(request, "outlet.manage", {
        canteenId,
        outletId,
      });
      const station = await transaction(pool, async (client) => {
        const saved = await client.query(
          "UPDATE mealy.kitchen_stations SET code=$3,name=$4,status=$5,updated_at=now() WHERE id=$1 AND outlet_id=$2 RETURNING *",
          [stationId, outletId, input.code, input.name, input.status],
        );
        if (!saved.rows[0])
          throw new AppError(
            "STATION_NOT_FOUND",
            "Kitchen station was not found.",
            404,
          );
        request.principal = principal;
        await audit(client, request, {
          action: "kitchen.station_updated",
          entityType: "kitchen_station",
          entityId: stationId,
          canteenId,
          outletId,
          after: input,
        });
        return saved.rows[0];
      });
      return { data: { kitchen_station: station } };
    },
  );

  const savePrinter = async (
    request: FastifyRequest,
    outletId: string,
    printerId?: string,
  ) => {
    const input = printerSchema.parse(request.body);
    const canteenId = await outletScope(pool, outletId);
    const principal = requirePermission(request, "outlet.manage", {
      canteenId,
      outletId,
    });
    return transaction(pool, async (client) => {
      const saved = printerId
        ? await client.query(
            `UPDATE mealy.printers SET code=$3,name=$4,printer_type=$5,connection_config=$6,paper_width_mm=$7,status=$8,updated_at=now() WHERE id=$1 AND outlet_id=$2 RETURNING *`,
            [
              printerId,
              outletId,
              input.code,
              input.name,
              input.printer_type,
              { queue: input.queue },
              input.paper_width_mm,
              input.status,
            ],
          )
        : await client.query(
            `INSERT INTO mealy.printers (outlet_id,code,name,printer_type,connection_config,paper_width_mm,status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
            [
              outletId,
              input.code,
              input.name,
              input.printer_type,
              { queue: input.queue },
              input.paper_width_mm,
              input.status,
            ],
          );
      if (!saved.rows[0])
        throw new AppError("PRINTER_NOT_FOUND", "Printer was not found.", 404);
      request.principal = principal;
      await audit(client, request, {
        action: printerId ? "printer.updated" : "printer.enrolled",
        entityType: "printer",
        entityId: saved.rows[0].id,
        canteenId,
        outletId,
        after: input,
      });
      return saved.rows[0];
    });
  };
  app.post<{ Params: { outletId: string } }>(
    "/v1/management/outlets/:outletId/printers",
    async (request, reply) =>
      reply
        .status(201)
        .send({
          data: {
            printer: await savePrinter(
              request,
              z.string().uuid().parse(request.params.outletId),
            ),
          },
        }),
  );
  app.put<{ Params: { outletId: string; printerId: string } }>(
    "/v1/management/outlets/:outletId/printers/:printerId",
    async (request) => ({
      data: {
        printer: await savePrinter(
          request,
          z.string().uuid().parse(request.params.outletId),
          z.string().uuid().parse(request.params.printerId),
        ),
      },
    }),
  );

  app.post<{ Params: { outletId: string } }>(
    "/v1/management/outlets/:outletId/printer-routes",
    async (request, reply) => {
      const outletId = z.string().uuid().parse(request.params.outletId);
      const input = routeSchema.parse(request.body);
      const canteenId = await outletScope(pool, outletId);
      const principal = requirePermission(request, "outlet.manage", {
        canteenId,
        outletId,
      });
      const route = await transaction(pool, async (client) => {
        const printer = await client.query(
          "SELECT 1 FROM mealy.printers WHERE id=$1 AND outlet_id=$2",
          [input.printer_id, outletId],
        );
        if (!printer.rows[0])
          throw new AppError(
            "PRINTER_NOT_FOUND",
            "Printer was not found for this outlet.",
            404,
          );
        if (input.kitchen_station_id) {
          const station = await client.query(
            "SELECT 1 FROM mealy.kitchen_stations WHERE id=$1 AND outlet_id=$2",
            [input.kitchen_station_id, outletId],
          );
          if (!station.rows[0])
            throw new AppError(
              "STATION_NOT_FOUND",
              "Kitchen station was not found for this outlet.",
              404,
            );
        }
        if (input.terminal_id) {
          const terminal = await client.query(
            "SELECT 1 FROM mealy.pos_terminals WHERE id=$1 AND outlet_id=$2",
            [input.terminal_id, outletId],
          );
          if (!terminal.rows[0])
            throw new AppError(
              "TERMINAL_NOT_FOUND",
              "POS terminal was not found for this outlet.",
              404,
            );
        }
        const saved = await client.query(
          `INSERT INTO mealy.printer_routes (outlet_id,printer_id,document_type,kitchen_station_id,terminal_id,copies,is_active) VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING *`,
          [
            outletId,
            input.printer_id,
            input.document_type,
            input.kitchen_station_id ?? null,
            input.terminal_id ?? null,
            input.copies,
          ],
        );
        request.principal = principal;
        await audit(client, request, {
          action: "printer.route_created",
          entityType: "printer_route",
          entityId: saved.rows[0].id,
          canteenId,
          outletId,
          after: input,
        });
        return saved.rows[0];
      });
      return reply.status(201).send({ data: { printer_route: route } });
    },
  );
  app.delete<{ Params: { outletId: string; routeId: string } }>(
    "/v1/management/outlets/:outletId/printer-routes/:routeId",
    async (request) => {
      const outletId = z.string().uuid().parse(request.params.outletId);
      const routeId = z.string().uuid().parse(request.params.routeId);
      const canteenId = await outletScope(pool, outletId);
      const principal = requirePermission(request, "outlet.manage", {
        canteenId,
        outletId,
      });
      await transaction(pool, async (client) => {
        const removed = await client.query(
          "DELETE FROM mealy.printer_routes WHERE id=$1 AND outlet_id=$2 RETURNING id",
          [routeId, outletId],
        );
        if (!removed.rows[0])
          throw new AppError(
            "PRINTER_ROUTE_NOT_FOUND",
            "Printer route was not found.",
            404,
          );
        request.principal = principal;
        await audit(client, request, {
          action: "printer.route_removed",
          entityType: "printer_route",
          entityId: routeId,
          canteenId,
          outletId,
          after: { removed: true },
        });
      });
      return { data: { id: routeId } };
    },
  );

  app.post<{ Params: { outletId: string } }>(
    "/v1/management/outlets/:outletId/gateways",
    async (request, reply) => {
      const outletId = z.string().uuid().parse(request.params.outletId);
      const input = gatewaySchema.parse(request.body);
      const canteenId = await outletScope(pool, outletId);
      const principal = requirePermission(request, "outlet.manage", {
        canteenId,
        outletId,
      });
      const token = newOpaqueToken();
      const gateway = await transaction(pool, async (client) => {
        const exists = await client.query(
          "SELECT 1 FROM mealy.outlet_gateways WHERE gateway_key=$1",
          [input.gateway_key],
        );
        if (exists.rows[0])
          throw new AppError(
            "GATEWAY_KEY_TAKEN",
            "Use a different gateway code.",
            409,
          );
        const saved = await client.query(
          `INSERT INTO mealy.outlet_gateways (outlet_id,gateway_key,display_name,token_hash,status) VALUES ($1,$2,$3,$4,'active') RETURNING id,outlet_id,gateway_key,display_name,status`,
          [outletId, input.gateway_key, input.display_name, hashToken(token)],
        );
        request.principal = principal;
        await audit(client, request, {
          action: "device.gateway_enrolled",
          entityType: "outlet_gateway",
          entityId: saved.rows[0].id,
          canteenId,
          outletId,
          after: {
            gateway_key: input.gateway_key,
            display_name: input.display_name,
          },
        });
        return saved.rows[0];
      });
      return reply
        .status(201)
        .send({ data: { gateway, enrollment_token: token } });
    },
  );
  app.post<{ Params: { outletId: string; gatewayId: string } }>(
    "/v1/management/outlets/:outletId/gateways/:gatewayId/rotate-token",
    async (request) => {
      const outletId = z.string().uuid().parse(request.params.outletId);
      const gatewayId = z.string().uuid().parse(request.params.gatewayId);
      const canteenId = await outletScope(pool, outletId);
      const principal = requirePermission(request, "outlet.manage", {
        canteenId,
        outletId,
      });
      const token = newOpaqueToken();
      const gateway = await transaction(pool, async (client) => {
        const updated = await client.query(
          "UPDATE mealy.outlet_gateways SET token_hash=$3,status='active',updated_at=now() WHERE id=$1 AND outlet_id=$2 RETURNING id,gateway_key,display_name,status",
          [gatewayId, outletId, hashToken(token)],
        );
        if (!updated.rows[0])
          throw new AppError(
            "GATEWAY_NOT_FOUND",
            "Gateway was not found.",
            404,
          );
        request.principal = principal;
        await audit(client, request, {
          action: "device.gateway_token_rotated",
          entityType: "outlet_gateway",
          entityId: gatewayId,
          canteenId,
          outletId,
          after: { gateway_key: updated.rows[0].gateway_key },
        });
        return updated.rows[0];
      });
      return { data: { gateway, enrollment_token: token } };
    },
  );
}
