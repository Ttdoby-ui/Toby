// @ts-check
//
// B2B Kein Gratisversand – Shopify Function (Delivery Customization)
//
// Blendet alle kostenlosen Versandoptionen (Preis = 0,00) aus, wenn der
// Kunde eines der Tags B2B1, B2B2 oder B2B3 trägt.

export function run(input) {
  const customer = input.cart.buyerIdentity && input.cart.buyerIdentity.customer;
  const isB2B = customer && (customer.b2b1 === true || customer.b2b2 === true || customer.b2b3 === true);

  if (!isB2B) return { operations: [] };

  const operations = [];
  for (const group of input.deliveryGroups) {
    for (const option of group.deliveryOptions) {
      if (parseFloat(option.cost.amount) === 0) {
        operations.push({ hide: { deliveryOptionHandle: option.handle } });
      }
    }
  }

  return { operations };
}
