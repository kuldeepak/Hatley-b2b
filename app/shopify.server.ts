import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

/* ---------------------------------
   SHOPIFY APP CONFIG
---------------------------------- */

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL!,
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,

  // ✅ WEBHOOK CONFIG
  webhooks: {
    ORDERS_CREATE: {
      deliveryMethod: "HTTP",
      callbackUrl: "/webhooks/orders-create",
    },
  },

  future: {
    expiringOfflineAccessTokens: true,
  },

  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;

/* ---------------------------------
   REMIX EXPORTS
---------------------------------- */

export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;

/* ---------------------------------
   SHOPIFY GRAPHQL HELPER
---------------------------------- */

type ShopifyGraphQLParams = {
  shop: string;
  query: string;
  variables?: Record<string, any>;
};

export async function shopifyGraphQL({
  shop,
  query,
  variables = {},
}: ShopifyGraphQLParams) {
  const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN!;
  const API_VERSION = "2026-04";

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

  const text = await res.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("❌ Invalid JSON from Shopify");
  }

  if (!res.ok || data.errors) {
    console.error("❌ Shopify GraphQL Error:", data);
    throw new Error("Shopify GraphQL failed");
  }

  return data;
}
