export function formDataObject(formData: FormData) {
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  const texts = (key: string) =>
    formData.getAll(key).filter((value): value is string => typeof value === "string");
  return {
    title: text("title"),
    circles: text("circles"),
    creators: text("creators"),
    fandoms: texts("fandoms"),
    characters: texts("characters"),
    pairings: texts("pairings"),
    fandomTagIds: texts("fandomTagIds"),
    characterTagIds: texts("characterTagIds"),
    pairingTagIds: texts("pairingTagIds"),
    genres: text("genres"),
    tags: text("tags"),
    adultRating: text("adultRating") || "general",
    publishedOn: text("publishedOn"),
    edition: text("edition"),
    storageLocationId: text("storageLocationId") || null,
    storageLocation: text("storageLocation"),
    readStatus: text("readStatus") || "unread",
    ownershipStatus: text("ownershipStatus") || "owned",
    favorite: text("favorite") === "true" || text("favorite") === "on",
    notes: text("notes"),
    eventId: text("eventId") || null,
    purchasedOn: text("purchasedOn"),
    priceYen: text("priceYen") || null,
    quantity: text("quantity") || "1",
    acquisitionNotes: text("acquisitionNotes"),
  };
}
