export type AdultRating = "general" | "r18";
export type ReadStatus = "unread" | "reading" | "read";
export type TagType = "fandom" | "character" | "pairing" | "genre" | "custom";

export type BookSummary = {
  id: string;
  title: string;
  adultRating: AdultRating;
  edition: string;
  readStatus: ReadStatus;
  favorite: boolean;
  notes: string;
  coverUrl: string | null;
  thumbnailUrl: string | null;
  storageLocation: string | null;
  circles: string[];
  creators: string[];
  tags: Array<{
    id: string;
    name: string;
    type: TagType;
    parentId: string | null;
    parentName: string | null;
  }>;
  ownedCount: number;
  latestEvent: string | null;
  updatedAt: string;
};

export type BookDetail = BookSummary & {
  publishedOn: string | null;
  storageLocationId: string | null;
  acquisitions: Array<{
    id: string;
    eventId: string | null;
    eventName: string | null;
    purchasedOn: string | null;
    priceYen: number | null;
    quantity: number;
    notes: string;
  }>;
};

export type EventSummary = {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string | null;
  venue: string;
  notes: string;
  bookCount: number;
  totalQuantity: number;
};
