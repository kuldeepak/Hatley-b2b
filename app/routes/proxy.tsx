import { shopifyGraphQL } from "../shopify.server";

/**
 * Small helper to return JSON responses
 */
function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

/**
 * Loader (optional – health check)
 */
export async function loader() {
  return jsonResponse({ ok: true });
}

/**
 * Action handler
 */
export async function action({ request }: { request: Request }) {
  try {
    const body = (await request.json()) as {
      actionType?: "fetchCompany" | "fetchRepCompanies" | "assignCompany";
      customerId?: string;
      repCode?: string;
      companyId?: string;
    };

    const { actionType, customerId, repCode, companyId } = body;

    if (!actionType) {
      return jsonResponse({ error: "Missing actionType" }, 400);
    }

    /* ============================
       1️⃣ Fetch customer company
    ============================ */
    if (actionType === "fetchCompany") {
      if (!customerId) {
        return jsonResponse({ error: "Missing customerId" }, 400);
      }

      const result = await shopifyGraphQL({
        shop: process.env.SHOPIFY_STORE_DOMAIN as string,
        query: `
          query ($id: ID!) {
            customer(id: $id) {
              metafield(namespace: "custom", key: "rep_code") {
                value
              }
              companyContactProfiles {
                company {
                  id
                  name
                }
              }
            }
          }
        `,
        variables: {
          id: `gid://shopify/Customer/${customerId}`,
        },
      });

      const customer = result?.data?.customer;
      const company =
        customer?.companyContactProfiles?.[0]?.company ?? null;

      return jsonResponse({
        company,
        repCode: customer?.metafield?.value ?? "",
      });
    }

    /* ============================
       2️⃣ Fetch rep companies
    ============================ */
    if (actionType === "fetchRepCompanies") {
      if (!repCode) {
        return jsonResponse({ companies: [] });
      }

      const result = await shopifyGraphQL({
        shop: process.env.SHOPIFY_STORE_DOMAIN as string,
        query: `
          query ($query: String!) {
            companies(first: 250, query: $query) {
              edges {
                node {
                  id
                  name
                }
              }
            }
          }
        `,
        variables: {
          query: `metafields.custom.rep_codes:"${repCode}"`,
        },
      });

      const companies =
        result?.data?.companies?.edges?.map(
          (edge: { node: unknown }) => edge.node
        ) ?? [];

      return jsonResponse({ companies });
    }

    /* ============================
       3️⃣ Assign company
    ============================ */
    if (actionType === "assignCompany") {
      if (!customerId || !companyId) {
        return jsonResponse(
          { error: "Missing customerId or companyId" },
          400
        );
      }

      // Fetch existing company contact profiles
      const fetchResult = await shopifyGraphQL({
        shop: process.env.SHOPIFY_STORE_DOMAIN as string,
        query: `
          query ($id: ID!) {
            customer(id: $id) {
              companyContactProfiles {
                id
              }
            }
          }
        `,
        variables: {
          id: `gid://shopify/Customer/${customerId}`,
        },
      });

      const profiles =
        fetchResult?.data?.customer?.companyContactProfiles ?? [];

      // Remove customer from existing companies
      for (const profile of profiles) {
        await shopifyGraphQL({
          shop: process.env.SHOPIFY_STORE_DOMAIN as string,
          query: `
            mutation ($id: ID!) {
              companyContactRemoveFromCompany(companyContactId: $id) {
                removedCompanyContactId
              }
            }
          `,
          variables: {
            id: profile.id,
          },
        });
      }

      // Assign customer to new company
      const assignResult = await shopifyGraphQL({
        shop: process.env.SHOPIFY_STORE_DOMAIN as string,
        query: `
          mutation ($companyId: ID!, $customerId: ID!) {
            companyAssignCustomerAsContact(
              companyId: $companyId
              customerId: $customerId
            ) {
              userErrors {
                message
              }
            }
          }
        `,
        variables: {
          companyId,
          customerId: `gid://shopify/Customer/${customerId}`,
        },
      });

      const errors =
        assignResult?.data?.companyAssignCustomerAsContact?.userErrors;

      if (errors?.length) {
        return jsonResponse({ error: errors[0].message }, 400);
      }

      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: "Invalid actionType" }, 400);
  } catch (error) {
    console.error("❌ PROXY ERROR:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
}