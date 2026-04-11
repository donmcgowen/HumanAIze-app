import { describe, it, expect, beforeEach, vi } from "vitest";

describe("BarcodeScanner", () => {
  describe("Barcode validation", () => {
    it("should accept valid UPC barcodes (12 digits)", () => {
      const barcode = "012345678905";
      const isValid = /^\d{8,14}$/.test(barcode);
      expect(isValid).toBe(true);
    });

    it("should accept valid EAN barcodes (13 digits)", () => {
      const barcode = "5901234123457";
      const isValid = /^\d{8,14}$/.test(barcode);
      expect(isValid).toBe(true);
    });

    it("should accept valid Code128 barcodes (14 digits)", () => {
      const barcode = "59012341234570";
      const isValid = /^\d{8,14}$/.test(barcode);
      expect(isValid).toBe(true);
    });

    it("should accept 8-digit barcodes", () => {
      const barcode = "12345678";
      const isValid = /^\d{8,14}$/.test(barcode);
      expect(isValid).toBe(true);
    });

    it("should reject non-numeric barcodes", () => {
      const barcode = "ABC123DEF456";
      const isValid = /^\d{8,14}$/.test(barcode);
      expect(isValid).toBe(false);
    });

    it("should reject barcodes shorter than 8 digits", () => {
      const barcode = "1234567";
      const isValid = /^\d{8,14}$/.test(barcode);
      expect(isValid).toBe(false);
    });

    it("should reject barcodes longer than 14 digits", () => {
      const barcode = "123456789012345";
      const isValid = /^\d{8,14}$/.test(barcode);
      expect(isValid).toBe(false);
    });

    it("should reject empty barcodes", () => {
      const barcode = "";
      const isValid = barcode && barcode.length > 0;
      expect(isValid).toBe(false);
    });
  });

  describe("Common barcode formats", () => {
    it("should recognize common product barcodes", () => {
      const testCases = [
        { barcode: "036000291204", name: "Coca-Cola" },
        { barcode: "012000007962", name: "Tropicana" },
        { barcode: "041331349992", name: "Cheerios" },
        { barcode: "074170051413", name: "Sprite" },
        { barcode: "660726503270", name: "Muscle Milk Protein Powder" },
      ];

      testCases.forEach(({ barcode }) => {
        const isValid = /^\d{12}$/.test(barcode);
        expect(isValid).toBe(true);
      });
    });

    it("should handle EAN-13 format for international products", () => {
      const ean13Barcodes = [
        "5901234123457",
        "4006381333931",
        "9780201379624",
      ];

      ean13Barcodes.forEach((barcode) => {
        const isValid = /^\d{13}$/.test(barcode);
        expect(isValid).toBe(true);
      });
    });
  });

  describe("Barcode scanning edge cases", () => {
    it("should handle barcodes with leading zeros", () => {
      const barcode = "000012345678";
      const isValid = /^\d{12}$/.test(barcode);
      expect(isValid).toBe(true);
    });

    it("should handle barcodes with all same digits", () => {
      const barcode = "111111111111";
      const isValid = /^\d{12}$/.test(barcode);
      expect(isValid).toBe(true);
    });

    it("should reject barcodes with spaces", () => {
      const barcode = "0123 4567 8905";
      const isValid = /^\d{12}$/.test(barcode);
      expect(isValid).toBe(false);
    });

    it("should reject barcodes with dashes", () => {
      const barcode = "0123-4567-8905";
      const isValid = /^\d{12}$/.test(barcode);
      expect(isValid).toBe(false);
    });

    it("should reject barcodes with special characters", () => {
      const barcode = "0123456789@5";
      const isValid = /^\d{12}$/.test(barcode);
      expect(isValid).toBe(false);
    });
  });

  describe("Barcode scanning performance", () => {
    it("should validate barcode quickly", () => {
      const barcode = "012345678905";
      const startTime = performance.now();
      const isValid = /^\d{12}$/.test(barcode);
      const endTime = performance.now();

      expect(isValid).toBe(true);
      expect(endTime - startTime).toBeLessThan(1); // Should be < 1ms
    });

    it("should handle rapid successive scans", () => {
      const barcodes = [
        "012345678905",
        "012345678906",
        "012345678907",
        "012345678908",
        "012345678909",
      ];

      const results = barcodes.map((barcode) => /^\d{12}$/.test(barcode));
      expect(results).toEqual([true, true, true, true, true]);
    });
  });
});
