ALTER TABLE `products` ADD `gallery_urls` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `video_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `description` text DEFAULT '' NOT NULL;