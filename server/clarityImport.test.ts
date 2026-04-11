import { describe, it, expect } from "vitest";
import {
  parseClarityCSV,
  validateClarityCSV,
  calculateReadingStats,
  filterReadingsByDateRange,
  detectReadingGaps,
} from "./clarityImport";

describe("Clarity CSV Import", () => {
  const validCSV = `Timestamp,Glucose Value (mg/dL),Trend,Type
2026-04-11 08:00:00,120,Flat,Sensor
2026-04-11 08:05:00,122,Flat,Sensor
2026-04-11 08:10:00,125,Up,Sensor
2026-04-11 08:15:00,128,Up,Sensor
2026-04-11 08:20:00,130,Flat,Sensor`;

  describe("validateClarityCSV", () => {
    it("should validate correct CSV format", () => {
      const result = validateClarityCSV(validCSV);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should reject empty CSV", () => {
      const result = validateClarityCSV("");
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should reject CSV without required columns", () => {
      const invalidCSV = "Date,Value\n2026-04-11,100";
      const result = validateClarityCSV(invalidCSV);
      expect(result.valid).toBe(false);
    });

    it("should reject CSV with only header", () => {
      const headerOnly = "Timestamp,Glucose Value (mg/dL),Trend,Type";
      const result = validateClarityCSV(headerOnly);
      expect(result.valid).toBe(false);
    });
  });

  describe("parseClarityCSV", () => {
    it("should parse valid CSV correctly", () => {
      const result = parseClarityCSV(validCSV);
      expect(result.importedCount).toBe(5);
      expect(result.skippedCount).toBe(0);
      expect(result.readings.length).toBe(5);
      expect(result.readings[0].value).toBe(120);
      expect(result.readings[0].type).toBe("sensor");
    });

    it("should skip invalid glucose values", () => {
      const csvWithInvalid = `Timestamp,Glucose Value (mg/dL),Trend,Type
2026-04-11 08:00:00,120,Flat,Sensor
2026-04-11 08:05:00,invalid,Flat,Sensor
2026-04-11 08:10:00,125,Up,Sensor`;
      const result = parseClarityCSV(csvWithInvalid);
      expect(result.importedCount).toBe(2);
      expect(result.skippedCount).toBe(1);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should skip glucose values outside valid range", () => {
      const csvWithOutOfRange = `Timestamp,Glucose Value (mg/dL),Trend,Type
2026-04-11 08:00:00,120,Flat,Sensor
2026-04-11 08:05:00,10,Flat,Sensor
2026-04-11 08:10:00,700,Up,Sensor`;
      const result = parseClarityCSV(csvWithOutOfRange);
      expect(result.importedCount).toBe(1);
      expect(result.skippedCount).toBe(2);
    });

    it("should detect reading types correctly", () => {
      const csvWithTypes = `Timestamp,Glucose Value (mg/dL),Trend,Type
2026-04-11 08:00:00,120,Flat,Sensor
2026-04-11 08:05:00,122,Flat,Fingerstick
2026-04-11 08:10:00,125,Up,Manual`;
      const result = parseClarityCSV(csvWithTypes);
      expect(result.readings[0].type).toBe("sensor");
      expect(result.readings[1].type).toBe("fingerstick");
      expect(result.readings[2].type).toBe("manual");
    });

    it("should sort readings by timestamp", () => {
      const unsortedCSV = `Timestamp,Glucose Value (mg/dL),Trend,Type
2026-04-11 08:10:00,125,Up,Sensor
2026-04-11 08:00:00,120,Flat,Sensor
2026-04-11 08:05:00,122,Flat,Sensor`;
      const result = parseClarityCSV(unsortedCSV);
      expect(result.readings[0].value).toBe(120);
      expect(result.readings[1].value).toBe(122);
      expect(result.readings[2].value).toBe(125);
    });
  });

  describe("calculateReadingStats", () => {
    it("should calculate statistics correctly", () => {
      const result = parseClarityCSV(validCSV);
      const stats = calculateReadingStats(result.readings);
      expect(stats.count).toBe(5);
      expect(stats.average).toBe(125);
      expect(stats.min).toBe(120);
      expect(stats.max).toBe(130);
    });

    it("should handle empty readings", () => {
      const stats = calculateReadingStats([]);
      expect(stats.count).toBe(0);
      expect(stats.average).toBe(0);
      expect(stats.min).toBe(0);
      expect(stats.max).toBe(0);
    });

    it("should calculate correct time range", () => {
      const result = parseClarityCSV(validCSV);
      const stats = calculateReadingStats(result.readings);
      expect(stats.timeRange.start).toBeDefined();
      expect(stats.timeRange.end).toBeDefined();
    });
  });

  describe("filterReadingsByDateRange", () => {
    it("should filter readings by date range", () => {
      const result = parseClarityCSV(validCSV);
      const startDate = new Date("2026-04-11T08:05:00");
      const endDate = new Date("2026-04-11T08:15:00");
      const filtered = filterReadingsByDateRange(result.readings, startDate, endDate);
      expect(filtered.length).toBe(3);
      expect(filtered[0].value).toBe(122);
      expect(filtered[filtered.length - 1].value).toBe(128);
    });

    it("should return empty array if no readings in range", () => {
      const result = parseClarityCSV(validCSV);
      const startDate = new Date("2026-04-12T08:00:00");
      const endDate = new Date("2026-04-12T09:00:00");
      const filtered = filterReadingsByDateRange(result.readings, startDate, endDate);
      expect(filtered.length).toBe(0);
    });
  });

  describe("detectReadingGaps", () => {
    it("should detect gaps in readings", () => {
      const csvWithGap = `Timestamp,Glucose Value (mg/dL),Trend,Type
2026-04-11 08:00:00,120,Flat,Sensor
2026-04-11 08:05:00,122,Flat,Sensor
2026-04-11 09:00:00,125,Up,Sensor`;
      const result = parseClarityCSV(csvWithGap);
      const gaps = detectReadingGaps(result.readings, 30);
      expect(gaps.length).toBe(1);
      expect(gaps[0].durationMinutes).toBe(55);
    });

    it("should not detect gaps below threshold", () => {
      const result = parseClarityCSV(validCSV);
      const gaps = detectReadingGaps(result.readings, 30);
      expect(gaps.length).toBe(0);
    });

    it("should handle empty readings", () => {
      const gaps = detectReadingGaps([], 30);
      expect(gaps.length).toBe(0);
    });

    it("should handle single reading", () => {
      const result = parseClarityCSV(validCSV);
      const gaps = detectReadingGaps(result.readings.slice(0, 1), 30);
      expect(gaps.length).toBe(0);
    });
  });
});
