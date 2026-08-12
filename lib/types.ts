export type AdultRating = "general" | "r18";
export type ReadStatus = "unread" | "reading" | "read";
export type OwnershipStatus = "owned" | "disposed";
export type TagType = "fandom" | "character" | "pairing" | "genre" | "custom";

export type BookSummary = {
  id: string;
  title: string;
  adultRating: AdultRating;
  edition: string;
  readStatus: ReadStatus;
  ownershipStatus: OwnershipStatus;
  disposedAt: string | null;
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
  wishlistCount: number;
  wishlistRemainingCount: number;
};

export type WishlistItem = {
  id: string;
  eventId: string;
  bookId: string | null;
  eventDay: number;
  title: string;
  circle: string;
  creators: string;
  fandomTagIds: string[];
  characterTagIds: string[];
  pairingTagIds: string[];
  genres: string;
  tags: string;
  adultRating: AdultRating;
  publishedOn: string | null;
  edition: string;
  coverUrl: string | null;
  thumbnailUrl: string | null;
  booth: string;
  quantity: number;
  priceYen: number | null;
  notes: string;
  purchased: boolean;
  createdAt: string;
  updatedAt: string;
};
