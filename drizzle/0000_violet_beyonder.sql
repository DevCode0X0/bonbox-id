CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT 'Home Living' NOT NULL,
	`price_label` text DEFAULT '' NOT NULL,
	`sales_label` text DEFAULT '' NOT NULL,
	`store` text DEFAULT '' NOT NULL,
	`commission_rate` text DEFAULT '' NOT NULL,
	`commission_label` text DEFAULT '' NOT NULL,
	`product_url` text NOT NULL,
	`affiliate_url` text NOT NULL,
	`image_url` text DEFAULT '' NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`updated_at` text NOT NULL
);
