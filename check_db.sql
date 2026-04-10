SELECT 'Glucose' as type, COUNT(*) as count FROM glucoseReadings WHERE userId = 1
UNION ALL
SELECT 'Activity', COUNT(*) FROM activitySamples WHERE userId = 1
UNION ALL
SELECT 'Sleep', COUNT(*) FROM sleepSessions WHERE userId = 1
UNION ALL
SELECT 'Nutrition', COUNT(*) FROM nutritionLogs WHERE userId = 1;
