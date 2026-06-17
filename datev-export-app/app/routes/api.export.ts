import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import iconv from "iconv-lite";
import { authenticate } from "~/shopify.server";
import { prisma } from "~/db.server";
// @ts-ignore
import { buildExtf } from "../../lib/datev-extf.mjs";
// @ts-ignore
import { SKR03_DEFAULT } from "../../lib/skr03-accounts.mjs";
import { DATEV_CONFIG } from "../../config.mjs";

interface ShopifyOrder {
  id: number;
  name: string;
  order_number: number;
  created_at: string;
  total_price: string;
  currency: string;
  payment_gateway_names: string[];
  transactions: Array<{
    id: number;
    status: string;
    kind: string;
    gateway: string;
    amount: string;
  }>;
  tax_lines: Array<{
    price: string;
    rate: number | string;
    title: string;
  }>;
}

/**
 * Fetches all Shopify orders in the given date range using paginated REST requests.
 * Follows Link header pagination until all pages are retrieved.
 */
async function fetchAllOrders(
  admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"],
  dateFrom: string,
  dateTo: string
): Promise<ShopifyOrder[]> {
  const orders: ShopifyOrder[] = [];

  // Ensure dateTo covers the full day
  const dateToEnd = dateTo.endsWith("T")
    ? dateTo
    : `${dateTo}T23:59:59Z`;

  const query: Record<string, string> = {
    status: "any",
    created_at_min: `${dateFrom}T00:00:00Z`,
    created_at_max: dateToEnd,
    limit: "250",
    fields:
      "id,name,order_number,created_at,total_price,currency,payment_gateway_names,transactions,tax_lines",
  };

  // First page
  let response = await admin.rest.get({
    path: "orders",
    query,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shopify API error ${response.status}: ${text}`);
  }

  let data = (await response.json()) as { orders: ShopifyOrder[] };
  orders.push(...(data.orders || []));

  // Paginate through remaining pages using Link header
  while (true) {
    const linkHeader = response.headers.get("Link");
    if (!linkHeader) break;

    // Extract next page URL from Link: <url>; rel="next"
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    if (!nextMatch) break;

    const nextUrl = nextMatch[1];

    // Extract page_info from the next URL
    const pageInfoMatch = nextUrl.match(/[?&]page_info=([^&]+)/);
    if (!pageInfoMatch) break;

    const pageInfo = pageInfoMatch[1];

    response = await admin.rest.get({
      path: "orders",
      query: {
        limit: "250",
        page_info: pageInfo,
        fields:
          "id,name,order_number,created_at,total_price,currency,payment_gateway_names,transactions,tax_lines",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Shopify API pagination error ${response.status}: ${text}`);
    }

    data = (await response.json()) as { orders: ShopifyOrder[] };
    if (!data.orders || data.orders.length === 0) break;
    orders.push(...data.orders);
  }

  return orders;
}

/**
 * Formats a date string as YYYYMMDD for the filename.
 */
function toFilenameDate(isoDate: string): string {
  return isoDate.replace(/-/g, "").slice(0, 8);
}

/**
 * GET handler for direct browser access (e.g. redirect from form action).
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const dateFrom = url.searchParams.get("dateFrom") || "";
  const dateTo = url.searchParams.get("dateTo") || "";

  if (!dateFrom || !dateTo) {
    return new Response("Fehlende Parameter: dateFrom und dateTo sind erforderlich.", {
      status: 400,
    });
  }

  return generateExport(admin, session, dateFrom, dateTo);
};

/**
 * POST handler for form submission.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const url = new URL(request.url);
  let dateFrom = url.searchParams.get("dateFrom") || "";
  let dateTo = url.searchParams.get("dateTo") || "";

  // Also check form data if not in URL
  if (!dateFrom || !dateTo) {
    const formData = await request.formData();
    dateFrom = (formData.get("dateFrom") as string) || dateFrom;
    dateTo = (formData.get("dateTo") as string) || dateTo;
  }

  if (!dateFrom || !dateTo) {
    return new Response("Fehlende Parameter: dateFrom und dateTo sind erforderlich.", {
      status: 400,
    });
  }

  return generateExport(admin, session, dateFrom, dateTo);
};

async function generateExport(
  admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"],
  session: Awaited<ReturnType<typeof authenticate.admin>>["session"],
  dateFrom: string,
  dateTo: string
): Promise<Response> {
  // Load shop config from DB, fall back to DATEV_CONFIG defaults
  const shopConfig = await prisma.shopConfig.findUnique({
    where: { shop: session.shop },
  });

  const beraterNr = shopConfig?.beraterNr ?? DATEV_CONFIG.beraterNr;
  const mandantNr = shopConfig?.mandantNr ?? DATEV_CONFIG.mandantNr;
  const wjBeginn = shopConfig?.wjBeginn ?? DATEV_CONFIG.wjBeginn;

  // Fetch all orders in the date range
  const orders = await fetchAllOrders(admin, dateFrom, dateTo);

  // Build EXTF export string
  const extfString = buildExtf(orders, {
    beraterNr,
    mandantNr,
    wjBeginn,
    dateFrom,
    dateTo,
    stapelName: `Shopify Umsätze ${dateFrom} bis ${dateTo}`,
    exportedBy: "Shopify DATEV Export",
    currency: "EUR",
    mapping: DATEV_CONFIG.mapping ?? SKR03_DEFAULT,
    createdAt: new Date(),
  });

  // Encode as Windows-1252
  const encoded = iconv.encode(extfString, "win1252");

  // Build filename
  const fromStr = toFilenameDate(dateFrom);
  const toStr = toFilenameDate(dateTo);
  const filename = `DATEV_${fromStr}_${toStr}.csv`;

  return new Response(encoded, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=windows-1252",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(encoded.length),
    },
  });
}
