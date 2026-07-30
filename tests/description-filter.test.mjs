import test from "node:test";
import assert from "node:assert/strict";
import { cleanShopeeDescription } from "../automation/extractor/description.mjs";

test("keeps product facts and removes seller policy lines", () => {
  const result = cleanShopeeDescription(`Kotak makan stainless steel
Kapasitas 1000 ml

Wajib sertakan video unboxing untuk komplain
Garansi tidak berlaku tanpa bukti video
Checkout berarti menyetujui ketentuan toko

Bahan food grade`);

  assert.equal(result, `Kotak makan stainless steel
Kapasitas 1000 ml

Bahan food grade`);
});

test("removes a standalone NB block without deleting later product details", () => {
  const result = cleanShopeeDescription(`Spesifikasi:
Warna biru

NB:
Hubungi admin jika barang kurang
Tidak menerima retur

Isi kemasan:
1 kotak makan`);

  assert.equal(result, `Spesifikasi:
Warna biru

Isi kemasan:
1 kotak makan`);
});

test("normalizes HTML and repeated whitespace", () => {
  const result = cleanShopeeDescription("Bahan: PP<br>Ukuran: 20 cm &amp; 10 cm");
  assert.equal(result, "Bahan: PP\nUkuran: 20 cm & 10 cm");
});
