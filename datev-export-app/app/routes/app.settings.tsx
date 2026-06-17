import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Form, useActionData, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  FormLayout,
  TextField,
  BlockStack,
  Banner,
  Box,
} from "@shopify/polaris";
import { useState, useEffect } from "react";
import { authenticate } from "~/shopify.server";
import { prisma } from "~/db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shopConfig = await prisma.shopConfig.findUnique({
    where: { shop: session.shop },
  });

  return json({
    shop: session.shop,
    shopConfig: shopConfig ?? {
      beraterNr: 290882,
      mandantNr: 15000,
      wjBeginn: "2026-01-01",
    },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const formData = await request.formData();
  const beraterNrRaw = formData.get("beraterNr") as string;
  const mandantNrRaw = formData.get("mandantNr") as string;
  const wjBeginn = (formData.get("wjBeginn") as string)?.trim();

  const beraterNr = parseInt(beraterNrRaw, 10);
  const mandantNr = parseInt(mandantNrRaw, 10);

  if (!beraterNr || !mandantNr || !wjBeginn) {
    return json({ success: false, error: "Alle Felder müssen ausgefüllt werden." });
  }

  if (isNaN(beraterNr) || isNaN(mandantNr)) {
    return json({ success: false, error: "Berater- und Mandantennummer müssen Zahlen sein." });
  }

  // Basic date format validation
  if (!/^\d{4}-\d{2}-\d{2}$/.test(wjBeginn)) {
    return json({ success: false, error: "Wirtschaftsjahresbeginn muss im Format YYYY-MM-DD angegeben werden." });
  }

  await prisma.shopConfig.upsert({
    where: { shop: session.shop },
    create: {
      shop: session.shop,
      beraterNr,
      mandantNr,
      wjBeginn,
    },
    update: {
      beraterNr,
      mandantNr,
      wjBeginn,
    },
  });

  return json({ success: true, error: null });
};

export default function Settings() {
  const { shopConfig } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  const [beraterNr, setBeraterNr] = useState(String(shopConfig.beraterNr));
  const [mandantNr, setMandantNr] = useState(String(shopConfig.mandantNr));
  const [wjBeginn, setWjBeginn] = useState(shopConfig.wjBeginn);

  const isLoading = navigation.state === "submitting";

  useEffect(() => {
    if (actionData?.success) {
      // Settings saved successfully
    }
  }, [actionData]);

  return (
    <Page
      title="Einstellungen"
      subtitle="DATEV-Konfiguration für diesen Shop"
      backAction={{ content: "Export", url: "/app" }}
    >
      <Layout>
        {actionData?.success && (
          <Layout.Section>
            <Banner tone="success">
              <Text as="p" variant="bodyMd">
                Einstellungen wurden gespeichert.
              </Text>
            </Banner>
          </Layout.Section>
        )}
        {actionData?.error && (
          <Layout.Section>
            <Banner tone="critical">
              <Text as="p" variant="bodyMd">
                {actionData.error}
              </Text>
            </Banner>
          </Layout.Section>
        )}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                DATEV Mandanten-Konfiguration
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Diese Werte werden in den DATEV-Header jedes Exports eingetragen.
                Bitte mit Ihrem Steuerberater abstimmen.
              </Text>
              <Form method="post">
                <FormLayout>
                  <TextField
                    label="Beraternummer"
                    name="beraterNr"
                    type="number"
                    value={beraterNr}
                    onChange={setBeraterNr}
                    autoComplete="off"
                    helpText="Die DATEV-Beraternummer Ihres Steuerberaters (z. B. 290882)"
                  />
                  <TextField
                    label="Mandantennummer"
                    name="mandantNr"
                    type="number"
                    value={mandantNr}
                    onChange={setMandantNr}
                    autoComplete="off"
                    helpText="Die DATEV-Mandantennummer Ihres Unternehmens (z. B. 15000)"
                  />
                  <TextField
                    label="Wirtschaftsjahresbeginn"
                    name="wjBeginn"
                    type="date"
                    value={wjBeginn}
                    onChange={setWjBeginn}
                    autoComplete="off"
                    helpText="Beginn des Wirtschaftsjahres (YYYY-MM-DD, z. B. 2026-01-01)"
                  />
                  <Box>
                    <Button submit variant="primary" loading={isLoading}>
                      Einstellungen speichern
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
                Hinweis: Kontenrahmen (SKR03)
              </Text>
              <Text as="p" variant="bodyMd">
                Die App verwendet standardmäßig den SKR03-Kontenrahmen mit
                folgenden Konten:
              </Text>
              <BlockStack gap="100">
                <Text as="p" variant="bodyMd">
                  <strong>Erlöse 19% USt:</strong> 8400
                </Text>
                <Text as="p" variant="bodyMd">
                  <strong>Erlöse 7% USt:</strong> 8300
                </Text>
                <Text as="p" variant="bodyMd">
                  <strong>Steuerfreie Erlöse:</strong> 8120
                </Text>
                <Text as="p" variant="bodyMd">
                  <strong>Shopify Payments:</strong> 1361
                </Text>
                <Text as="p" variant="bodyMd">
                  <strong>PayPal:</strong> 1362
                </Text>
                <Text as="p" variant="bodyMd">
                  <strong>Klarna:</strong> 1363
                </Text>
                <Text as="p" variant="bodyMd">
                  <strong>Banküberweisung / Vorkasse:</strong> 1200
                </Text>
              </BlockStack>
              <Text as="p" variant="bodyMd" tone="subdued">
                Eine individuelle Kontenanpassung ist in einer späteren Version
                geplant. Bitte stimmen Sie die Konten mit Ihrem Steuerberater ab.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
