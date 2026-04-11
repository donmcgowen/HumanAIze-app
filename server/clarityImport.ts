/**
 * Dexcom Clarity CSV Import Module
 * 
 * Parses Dexcom Clarity CSV exports and converts them to glucose readings
 * Clarity exports contain glucose readings, events, and statistics
 */

export interface GlucoseReading {
  timestamp: number; // Unix timestamp in milliseconds
  value: number; // Glucose value in mg/dL
  trend?: string; // Trend arrow (e.g., "Flat", "Up", "Down", "DoubleUp", "DoubleDown")
  type: "sensor" | "fingerstick" | "manual";
}

export interface ClarityImportResult {
  readings: GlucoseReading[];
  importedCount: number;
  skippedCount: number;
  errors: string[];
}

/**
 * Parse Dexcom Clarity CSV content
 * Expected format from clarity.dexcom.com export:
 * Timestamp,Glucose Value (mg/dL),Trend,Type
 * 2026-04-11 14:30:00,145,Flat,Sensor
 */
export function parseClarityCSV(csvContent: string): ClarityImportResult {
  const lines = csvContent.trim().split("\n");
  const readings: GlucoseReading[] = [];
  const errors: string[] = [];
  let skippedCount = 0;

  // Skip header row
  const dataLines = lines.slice(1);

  dataLines.forEach((line, index) => {
    try {
      const parts = line.split(",").map((p) => p.trim());

      if (parts.length < 2) {
        skippedCount++;
        return;
      }

      const [timestampStr, valueStr, trendStr, typeStr] = parts;

      // Parse timestamp
      const timestamp = new Date(timestampStr).getTime();
      if (isNaN(timestamp)) {
        errors.push(`Row ${index + 2}: Invalid timestamp format "${timestampStr}"`);
        skippedCount++;
        return;
      }

      // Parse glucose value
      const value = parseFloat(valueStr);
      if (isNaN(value) || value < 20 || value > 600) {
        errors.push(`Row ${index + 2}: Invalid glucose value "${valueStr}"`);
        skippedCount++;
        return;
      }

      // Determine reading type
      let type: "sensor" | "fingerstick" | "manual" = "sensor";
      if (typeStr) {
        const lowerType = typeStr.toLowerCase();
        if (lowerType.includes("fingerstick") || lowerType.includes("finger")) {
          type = "fingerstick";
        } else if (lowerType.includes("manual")) {
          type = "manual";
        }
      }

      readings.push({
        timestamp,
        value,
        trend: trendStr || undefined,
        type,
      });
    } catch (err) {
      errors.push(`Row ${index + 2}: ${err instanceof Error ? err.message : "Unknown error"}`);
      skippedCount++;
    }
  });

  return {
    readings: readings.sort((a, b) => a.timestamp - b.timestamp),
    importedCount: readings.length,
    skippedCount,
    errors,
  };
}

/**
 * Validate CSV file before parsing
 */
export function validateClarityCSV(csvContent: string): { valid: boolean; error?: string } {
  if (!csvContent || csvContent.trim().length === 0) {
    return { valid: false, error: "CSV file is empty" };
  }

  const lines = csvContent.trim().split("\n");
  if (lines.length < 2) {
    return { valid: false, error: "CSV must contain header and at least one data row" };
  }

  const header = lines[0].toLowerCase();
  const requiredFields = ["timestamp", "glucose"];

  const hasRequiredFields = requiredFields.some((field) => header.includes(field));
  if (!hasRequiredFields) {
    return { valid: false, error: "CSV must contain Timestamp and Glucose Value columns" };
  }

  return { valid: true };
}

/**
 * Calculate statistics from imported readings
 */
export function calculateReadingStats(readings: GlucoseReading[]) {
  if (readings.length === 0) {
    return {
      count: 0,
      average: 0,
      min: 0,
      max: 0,
      timeRange: { start: null, end: null },
    };
  }

  const values = readings.map((r) => r.value);
  const average = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  const min = Math.min(...values);
  const max = Math.max(...values);

  return {
    count: readings.length,
    average,
    min,
    max,
    timeRange: {
      start: new Date(readings[0].timestamp).toISOString(),
      end: new Date(readings[readings.length - 1].timestamp).toISOString(),
    },
  };
}

/**
 * Filter readings by date range
 */
export function filterReadingsByDateRange(
  readings: GlucoseReading[],
  startDate: Date,
  endDate: Date
): GlucoseReading[] {
  const startTime = startDate.getTime();
  const endTime = endDate.getTime();

  return readings.filter((r) => r.timestamp >= startTime && r.timestamp <= endTime);
}

/**
 * Detect gaps in glucose readings (e.g., sensor disconnections)
 * Returns array of gap periods with duration in minutes
 */
export function detectReadingGaps(readings: GlucoseReading[], gapThresholdMinutes: number = 30) {
  if (readings.length < 2) return [];

  const gaps: Array<{ startTime: number; endTime: number; durationMinutes: number }> = [];

  for (let i = 1; i < readings.length; i++) {
    const timeDiff = readings[i].timestamp - readings[i - 1].timestamp;
    const diffMinutes = timeDiff / (1000 * 60);

    if (diffMinutes > gapThresholdMinutes) {
      gaps.push({
        startTime: readings[i - 1].timestamp,
        endTime: readings[i].timestamp,
        durationMinutes: Math.round(diffMinutes),
      });
    }
  }

  return gaps;
}
