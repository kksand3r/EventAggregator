export type EventCategory =
  | "Concerts"
  | "Theatre"
  | "Comedy"
  | "Sports"
  | "Festivals"
  | "Exhibitions"
  | "Other";

export interface EventItem {
  id: string;
  title: string;
  slug: string;
  image: string;
  viewCount: number;
  date: string;
  city: string;
  category: EventCategory;
  price?: string;
  location?: string;
  description?: string;
}
