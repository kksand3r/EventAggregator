import type { EventItem } from "@/types/event";

const placeholderImage = (id: number) =>
  `https://picsum.photos/seed/event${id}/600/400`;

export const mockEvents: EventItem[] = [
  {
    id: "1",
    title: "Jazz Night under the Stars",
    slug: "jazz-night-under-the-stars",
    image: placeholderImage(1),
    viewCount: 1240,
    date: "Mar 15, 2025",
    city: "Kyiv",
    category: "Concerts",
    price: "from 350 UAH",
    location: "Park of Culture",
    description:
      "An evening of live jazz with local and international artists. Bring a blanket and enjoy the open air.",
  },
  {
    id: "2",
    title: "Hamlet — Modern Interpretation",
    slug: "hamlet-modern",
    image: placeholderImage(2),
    viewCount: 892,
    date: "Mar 20, 2025",
    city: "Lviv",
    category: "Theatre",
    price: "from 200 UAH",
    location: "Lviv Opera House",
    description:
      "A contemporary take on Shakespeare's classic, performed in Ukrainian.",
  },
  {
    id: "3",
    title: "Stand-Up Comedy Festival",
    slug: "stand-up-comedy-festival",
    image: placeholderImage(3),
    viewCount: 2103,
    date: "Apr 2, 2025",
    city: "Kyiv",
    category: "Comedy",
    price: "from 450 UAH",
    location: "Palace of Sports",
    description: "Three days of laughter with the best Ukrainian comedians.",
  },
  {
    id: "4",
    title: "Classical Symphony Evening",
    slug: "classical-symphony-evening",
    image: placeholderImage(4),
    viewCount: 567,
    date: "Mar 28, 2025",
    city: "Odesa",
    category: "Concerts",
    price: "from 300 UAH",
    location: "Philharmonic Hall",
    description: "Beethoven and Mozart program performed by the National Orchestra.",
  },
  {
    id: "5",
    title: "Street Art & Music Festival",
    slug: "street-art-music-festival",
    image: placeholderImage(5),
    viewCount: 3456,
    date: "Apr 10, 2025",
    city: "Kyiv",
    category: "Festivals",
    price: "Free entry",
    location: "Podil district",
    description: "Live murals, DJ sets, and food trucks. All ages welcome.",
  },
  {
    id: "6",
    title: "Contemporary Art Exhibition",
    slug: "contemporary-art-exhibition",
    image: placeholderImage(6),
    viewCount: 421,
    date: "Mar 22, 2025",
    city: "Kharkiv",
    category: "Exhibitions",
    price: "100 UAH",
    location: "Museum of Modern Art",
    description: "Works by emerging Ukrainian artists. Guided tours available.",
  },
];

export const categories: EventItem["category"][] = [
  "Concerts",
  "Theatre",
  "Comedy",
  "Sports",
  "Festivals",
  "Exhibitions",
  "Other",
];

export const cities = ["All", "Kyiv", "Lviv", "Odesa", "Kharkiv", "Dnipro"];
