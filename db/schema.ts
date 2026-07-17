import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull().default("Home Living"),
  priceLabel: text("price_label").notNull().default(""),
  salesLabel: text("sales_label").notNull().default(""),
  store: text("store").notNull().default(""),
  commissionRate: text("commission_rate").notNull().default(""),
  commissionLabel: text("commission_label").notNull().default(""),
  productUrl: text("product_url").notNull(),
  affiliateUrl: text("affiliate_url").notNull(),
  imageUrl: text("image_url").notNull().default(""),
  featured: integer("featured", { mode: "boolean" }).notNull().default(false),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  updatedAt: text("updated_at").notNull(),
});
