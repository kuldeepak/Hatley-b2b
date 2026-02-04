import { authenticate } from "../shopify.server";

/**
 * ENV
 */
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN as string;
const API_VERSION = "2026-04";

/**
 * Types
 */
type NoteAttribute = {
  name: string;
  value: string;
};

type OrderPayload = {
  id?: number | string;
  admin_graphql_api_id?: string;
  shop_domain?: string;
  note_attributes?: NoteAttribute[];
};

type FulfillmentOrderNode = {
  id: string;
  assignedLocation?: {
    location?: {
      id: string;
      name: string;
    };
  };
};

/**
 * Shopify GraphQL helper
 */
async function shopifyGraphQL(
  shop: string,
  query: string,
  variables?: Record<string, any>
) {
  const res = await fetch(
    `https://${shop}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": TOKEN,
      },
      body: JSON.stringify({ query, variables }),
    }
  );

  const json = await res.json();

  if (!res.ok || json.errors) {
    console.error("❌ Shopify GraphQL Error:", json);
  }

  return json;
}

/**
 * Webhook handler
 */
export async function action({ request }: { request: Request }) {
  console.log("🚀 orders/create webhook hit");

  try {
    let order: OrderPayload;
    let shop: string | null = null;

    if (process.env.NODE_ENV === "development") {
      order = await request.json();
      shop =
        request.headers.get("x-shopify-shop-domain") ??
        order.shop_domain ??
        null;
    } else {
  const { payload, shop: verifiedShop } =
    await authenticate.webhook(request);

      order = payload as OrderPayload;
      shop =
        request.headers.get("x-shopify-shop-domain") ??
        verifiedShop ??
        null;
    }

    if (!shop) {
      console.error("❌ Shop missing");
      return new Response("No shop", { status: 400 });
    }

    const orderId =
      order.admin_graphql_api_id ?? order.id?.toString();

    if (!orderId) {
      return new Response("No order id", { status: 200 });
    }

    const fulfillmentMode =
      order.note_attributes?.find(
        (a) => a.name === "fulfillment_mode"
      )?.value;

    if (!fulfillmentMode) {
      return new Response("No fulfillment mode", { status: 200 });
    }

    const TARGET_LOCATIONS: Record<string, string> = {
      booking: "gid://shopify/Location/77507559507",
      immediate: "gid://shopify/Location/77507592275",
    };

    const targetLocation = TARGET_LOCATIONS[fulfillmentMode];
    if (!targetLocation) {
      return new Response("Invalid mode", { status: 200 });
    }

    const GET_FULFILLMENT_ORDERS = `
      query ($orderId: ID!) {
        order(id: $orderId) {
          fulfillmentOrders(first: 10) {
            edges {
              node {
                id
                assignedLocation {
                  location { id name }
                }
              }
            }
          }
        }
      }
    `;

    const foData = await shopifyGraphQL(
      shop,
      GET_FULFILLMENT_ORDERS,
      { orderId }
    );

    const fulfillmentOrders: FulfillmentOrderNode[] =
      foData.data?.order?.fulfillmentOrders?.edges?.map(
        (e: any) => e.node
      ) ?? [];

    const MOVE_FULFILLMENT_ORDER = `
      mutation ($id: ID!, $locationId: ID!) {
        fulfillmentOrderMove(
          id: $id
          newLocationId: $locationId
        ) {
          movedFulfillmentOrder { id }
          userErrors { field message }
        }
      }
    `;

    for (const fo of fulfillmentOrders) {
      if (fo.assignedLocation?.location?.id === targetLocation) continue;

      await shopifyGraphQL(
        shop,
        MOVE_FULFILLMENT_ORDER,
        {
          id: fo.id,
          locationId: targetLocation,
        }
      );
    }

    console.log("✅ Fulfillment location updated");
    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("❌ Webhook error:", err);
    return new Response("Error", { status: 500 });
  }
}