export const CATEGORY_PAGE_SIZE = 20;

export function categoryToSlug(category: string) {
  return category
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " dan ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getCategoryDescription(category: string) {
  const descriptions: Record<string, string> = {
    "Botol & Tumbler":
      "Temukan botol minum dan tumbler praktis untuk menemani aktivitas di rumah, kantor, sekolah, dan perjalanan.",
    Kebersihan:
      "Jelajahi pilihan alat kebersihan untuk membantu mengepel, menyikat, dan merawat rumah dengan lebih praktis.",
    Penyimpanan:
      "Rapikan setiap ruang dengan pilihan rak, wadah, gantungan, dan perlengkapan penyimpanan yang mudah digunakan.",
  };

  return descriptions[category] ??
    `Jelajahi produk ${category.toLowerCase()} pilihan untuk membantu membuat aktivitas rumah terasa lebih mudah.`;
}
