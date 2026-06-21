import "@shopify/ui-extensions/preact";
import {render} from "preact";
import {useState, useMemo, useEffect} from "preact/hooks";

export default async () => {
  render(<App />, document.body);
};

function App() {
  const {applyMetafieldChange, i18n, data, discounts} = shopify;

  const initial = useMemo(
    () =>
      parseConfig(
        data?.metafields?.find(
          (m) => m.key === "function-configuration",
        )?.value,
      ),
    [data?.metafields],
  );

  const [aktiv, setAktiv] = useState(initial.aktiv);
  const [modus, setModus] = useState(initial.modus);
  const [kaufe, setKaufe] = useState(initial.kaufe);
  const [zahle, setZahle] = useState(initial.zahle);
  const [prozent, setProzent] = useState(initial.prozent);

  // This function only ever produces product discounts, so make sure the
  // discount carries the product class (otherwise the function returns nothing).
  const discountClasses = discounts?.discountClasses?.value ?? [];
  useEffect(() => {
    if (!discountClasses.includes("product")) {
      discounts?.updateDiscountClasses?.(["product"]);
    }
  }, [discountClasses]);

  async function save() {
    await applyMetafieldChange({
      type: "updateMetafield",
      namespace: "$app",
      key: "function-configuration",
      value: JSON.stringify({
        aktiv,
        modus,
        kaufe: Number(kaufe),
        zahle: Number(zahle),
        prozent: Number(prozent),
      }),
      valueType: "json",
    });
  }

  function resetForm() {
    setAktiv(initial.aktiv);
    setModus(initial.modus);
    setKaufe(initial.kaufe);
    setZahle(initial.zahle);
    setProzent(initial.prozent);
  }

  return (
    <s-function-settings
      onSubmit={(event) => event.waitUntil?.(save())}
      onReset={resetForm}
    >
      <s-heading>{i18n.translate("title")}</s-heading>
      <s-section>
        <s-stack gap="base">
          <s-text>{i18n.translate("vipInfo")}</s-text>

          <s-divider />

          <s-checkbox
            checked={aktiv}
            onChange={() => setAktiv(!aktiv)}
            label={i18n.translate("aktiv")}
          />

          {aktiv ? (
            <s-stack gap="base">
              <s-text>{i18n.translate("aktionsInfo")}</s-text>

              <s-select
                label={i18n.translate("modus")}
                value={modus}
                onChange={(event) => setModus(event.currentTarget.value)}
              >
                <s-option value="bxgy">
                  {i18n.translate("modusBxgy")}
                </s-option>
                <s-option value="prozent">
                  {i18n.translate("modusProzent")}
                </s-option>
              </s-select>

              {modus === "bxgy" ? (
                <s-stack direction="inline" gap="base">
                  <s-number-field
                    label={i18n.translate("kaufe")}
                    value={String(kaufe)}
                    min={1}
                    onChange={(event) => setKaufe(event.currentTarget.value)}
                  />
                  <s-number-field
                    label={i18n.translate("zahle")}
                    value={String(zahle)}
                    min={0}
                    onChange={(event) => setZahle(event.currentTarget.value)}
                  />
                </s-stack>
              ) : (
                <s-number-field
                  label={i18n.translate("prozent")}
                  value={String(prozent)}
                  min={0}
                  max={100}
                  suffix="%"
                  onChange={(event) => setProzent(event.currentTarget.value)}
                />
              )}
            </s-stack>
          ) : null}
        </s-stack>
      </s-section>
    </s-function-settings>
  );
}

function parseConfig(value) {
  try {
    const p = JSON.parse(value || "{}");
    return {
      aktiv: Boolean(p.aktiv),
      modus: p.modus === "prozent" ? "prozent" : "bxgy",
      kaufe: Number(p.kaufe ?? 4),
      zahle: Number(p.zahle ?? 3),
      prozent: Number(p.prozent ?? 25),
    };
  } catch (e) {
    return {aktiv: false, modus: "bxgy", kaufe: 4, zahle: 3, prozent: 25};
  }
}
