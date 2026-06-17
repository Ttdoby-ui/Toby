import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  FormLayout,
  TextField,
  BlockStack,
  InlineStack,
  Banner,
  Link,
  Box,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "~/shopify.server";
import { prisma } from "~/db.server";

// Returns first and last day of current month as YYYY-MM-DD strings
function currentMonthRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return {
    dateFrom: `${year}-${month}-01`,
    dateTo: `${year}-${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shopConfig = await prisma.shopConfig.findUnique({
    where: { shop: session.shop },
  });

  const defaults = currentMonthRange();

  return json({
    shop: session.shop,
    shopConfig,
    defaultDateFrom: defaults.dateFrom,
    defaultDateTo: defaults.dateTo,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);

  const formData = await request.formData();
  const dateFrom = formData.get("dateFrom") as string;
  const dateTo = formData.get("dateTo") as string;

  const params = new URLSearchParams();
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);

  return redirect(`/api/export?${params.toString()}`);
};

export default function Index() {
  const { shopConfig, defaultDateFrom, defaultDateTo } =
    useLoaderData<typeof loader>();
  const navigation = useNavigation();

  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(defaultDateTo);

  const isLoading = navigation.state === "submitting";

  const beraterNr = shopConfig?.beraterNr ?? 290882;
  const mandantNr = shopConfig?.mandantNr ?? 15000;
  const wjBeginn = shopConfig?.wjBeginn ?? "2026-01-01";

  return (
    <Page
      title="DATEV Export"
      subtitle="Exportiert Shopify-Bestellungen als DATEV-Buchungsstapel (EXTF)"
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Exportzeitraum wählen
              </Text>
              <Form method="post">
                <FormLayout>
                  <FormLayout.Group>
                    <TextField
                      label="Von (Datum)"
                      name="dateFrom"
                      type="date"
                      value={dateFrom}
                      onChange={setDateFrom}
                      autoComplete="off"
                      helpText="Erster Tag des Exportzeitraums (YYYY-MM-DD)"
                    />
                    <TextField
                      label="Bis (Datum)"
                      name="dateTo"
                      type="date"
                      value={dateTo}
                      onChange={setDateTo}
                      autoComplete="off"
                      helpText="Letzter Tag des Exportzeitraums (YYYY-MM-DD)"
                    />
                  </FormLayout.Group>
                  <Box>
                    <Button
                      submit
                      variant="primary"
                      loading={isLoading}
                      disabled={!dateFrom || !dateTo}
                    >
                      Export herunterladen
                    </Button>
                  </Box>
                </FormLayout>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Exportkonfiguration
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Folgende DATEV-Parameter werden für den Export verwendet:
              </Text>
              <BlockStack gap="200">
                <InlineStack gap="200" align="start">
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    Beraternummer:
                  </Text>
                  <Text as="span" variant="bodyMd">
                    {beraterNr}
                  </Text>
                </InlineStack>
                <InlineStack gap="200" align="start">
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    Mandantennummer:
                  </Text>
                  <Text as="span" variant="bodyMd">
                    {mandantNr}
                  </Text>
                </InlineStack>
                <InlineStack gap="200" align="start">
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    Wirtschaftsjahresbeginn:
                  </Text>
                  <Text as="span" variant="bodyMd">
                    {wjBeginn}
                  </Text>
                </InlineStack>
              </BlockStack>
              <Box paddingBlockStart="200">
                <Link url="/app/settings">Einstellungen bearbeiten</Link>
              </Box>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Banner tone="info">
            <BlockStack gap="200">
              <Text as="p" variant="bodyMd">
                Der Export enthält alle Bestellungen im gewählten Zeitraum als
                DATEV-Buchungsstapel (EXTF-Format). Die Datei wird direkt im
                Browser als CSV-Datei (Windows-1252-kodiert) heruntergeladen
                und kann in DATEV Unternehmen Online importiert werden.
              </Text>
            </BlockStack>
          </Banner>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
