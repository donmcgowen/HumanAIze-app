/**
 * Gemini AI Workout Plan Generator
 * Generates personalized workout plans based on user profile:
 * age, height, weight, fitness goal, activity level, medical conditions,
 * today's food intake (for pre-workout nutrition advice)
 */

import { ENV } from "./_core/env";

export interface WorkoutExercise {
  name: string;
  sets?: number;
  reps?: string;       // e.g. "8-12" or "to failure"
  weight?: string;     // e.g. "bodyweight", "moderate", "60% 1RM"
  durationSecs?: number;
  restSecs?: number;
  muscleGroup: string;
  instructions: string;
  modifications?: string; // For medical conditions
}

export interface WorkoutSection {
  name: string;
  durationMins: number;
  exercises: WorkoutExercise[];
  notes?: string;
}

export interface AIWorkoutPlan {
  title: string;
  overview: string;
  totalDurationMins: number;
  difficulty: "beginner" | "intermediate" | "advanced";
  focusArea: string;
  estimatedCalories: number;
  sections: WorkoutSection[];
  weeklySchedule?: string;
  safetyNotes?: string[];
  progressionTips?: string[];
  nutritionNote?: string; // Pre-workout nutrition advice based on today's food log
}

export interface WorkoutPlanRequest {
  ageYears?: number;
  heightIn?: number;
  weightLbs?: number;
  fitnessGoal?: "lose_fat" | "build_muscle" | "maintain";
  activityLevel?: "sedentary" | "lightly_active" | "moderately_active" | "very_active" | "extremely_active";
  diabetesType?: "type1" | "type2" | "prediabetes" | "gestational" | "other" | null;
  medicalNotes?: string;
  workoutType?: "strength" | "cardio" | "hiit" | "flexibility" | "full_body" | "upper_body" | "lower_body" | "core";
  durationMins?: number;
  intensity?: "light" | "moderate" | "intense";
  recentWorkouts?: Array<{ exerciseName: string; exerciseType: string; durationMinutes: number; recordedAt: number }>;
  customRequest?: string;
  // Today's food log for pre-workout nutrition advice
  todayCalories?: number;
  todayProtein?: number;
  todayCarbs?: number;
  todayFat?: number;
  dailyCalorieTarget?: number;
  dailyProteinTarget?: number;
}

const ACTIVITY_LABELS: Record<string, string> = {
  sedentary: "sedentary (desk job, little exercise)",
  lightly_active: "lightly active (1-3 days/week exercise)",
  moderately_active: "moderately active (3-5 days/week exercise)",
  very_active: "very active (6-7 days/week exercise)",
  extremely_active: "extremely active (athlete/physical job)",
};

const GOAL_LABELS: Record<string, string> = {
  lose_fat: "lose body fat / weight loss",
  build_muscle: "build muscle and strength",
  maintain: "maintain current fitness",
};

// Strict workout type definitions — Gemini must follow these exactly
const WORKOUT_TYPE_RULES: Record<string, string> = {
  strength: `STRENGTH TRAINING (weight lifting). You MUST include ONLY barbell, dumbbell, cable, or machine exercises with sets, reps, and weight guidance. Do NOT include cardio exercises like running, cycling, or jumping jacks in the main workout. This is a WEIGHT ROOM workout.`,
  upper_body: `UPPER BODY STRENGTH TRAINING. You MUST include ONLY exercises targeting chest, back, shoulders, biceps, and triceps — using barbells, dumbbells, cables, or machines. Examples: bench press, rows, shoulder press, pull-ups, curls, tricep extensions. Do NOT include leg exercises or cardio in the main workout.`,
  lower_body: `LOWER BODY STRENGTH TRAINING. You MUST include ONLY exercises targeting quads, hamstrings, glutes, and calves — using barbells, dumbbells, cables, or machines. Examples: squats, deadlifts, leg press, lunges, leg curl, calf raises. Do NOT include upper body or cardio exercises in the main workout.`,
  full_body: `FULL BODY STRENGTH TRAINING. Include compound movements that work multiple muscle groups — squats, deadlifts, bench press, rows, overhead press. Mix upper and lower body exercises. Use weights (barbells, dumbbells, or machines).`,
  cardio: `CARDIO WORKOUT. Include ONLY cardiovascular exercises — running, cycling, rowing, elliptical, swimming, jump rope, stair climbing. No weight lifting. Focus on heart rate zones, intervals, or steady-state cardio.`,
  hiit: `HIGH-INTENSITY INTERVAL TRAINING (HIIT). Alternate between high-intensity bursts (30-45 seconds) and rest/recovery (15-20 seconds). Include bodyweight exercises like burpees, jump squats, mountain climbers, high knees. Fast-paced, circuit-style.`,
  core: `CORE WORKOUT. Focus exclusively on core muscles — abs, obliques, lower back, hip flexors. Include planks, crunches, Russian twists, leg raises, dead bugs, bird dogs. Can be bodyweight or with light weights.`,
  flexibility: `FLEXIBILITY & MOBILITY WORKOUT. Include stretching, yoga poses, foam rolling, and mobility drills. Hold each stretch 30-60 seconds. Focus on major muscle groups and joints. No heavy lifting or intense cardio.`,
};

// Goal-based exercise selection guidance
const GOAL_EXERCISE_GUIDANCE: Record<string, string> = {
  lose_fat: `Since the user's goal is FAT LOSS: For strength workouts, use higher rep ranges (12-15 reps), shorter rest periods (45-60 seconds), and circuit-style supersets to keep heart rate elevated. For cardio, emphasize fat-burning zones (65-75% max HR). Prioritize compound movements that burn more calories.`,
  build_muscle: `Since the user's goal is MUSCLE BUILDING: Use moderate-heavy weights (70-85% 1RM), rep ranges of 6-12, and adequate rest periods (60-90 seconds) for hypertrophy. Include progressive overload guidance. Focus on compound lifts (squat, deadlift, bench, row) supplemented with isolation work.`,
  maintain: `Since the user's goal is MAINTENANCE: Use a balanced approach with moderate weights (60-75% 1RM), rep ranges of 10-15, and moderate rest periods. Include variety to prevent plateaus. Mix compound and isolation exercises.`,
};

export async function generateAIWorkoutPlan(request: WorkoutPlanRequest): Promise<AIWorkoutPlan> {
  const {
    ageYears,
    heightIn,
    weightLbs,
    fitnessGoal = "maintain",
    activityLevel = "moderately_active",
    diabetesType,
    medicalNotes,
    workoutType = "full_body",
    durationMins = 45,
    intensity = "moderate",
    recentWorkouts = [],
    customRequest,
    todayCalories,
    todayProtein,
    todayCarbs,
    dailyCalorieTarget,
    dailyProteinTarget,
  } = request;

  // Build user profile context
  const profileParts: string[] = [];
  if (ageYears) profileParts.push(`Age: ${ageYears} years old`);
  if (heightIn) {
    const ft = Math.floor(heightIn / 12);
    const inches = heightIn % 12;
    profileParts.push(`Height: ${ft}'${inches}"`);
  }
  if (weightLbs) profileParts.push(`Weight: ${weightLbs} lbs`);
  profileParts.push(`Fitness goal: ${GOAL_LABELS[fitnessGoal] || fitnessGoal}`);
  profileParts.push(`Activity level: ${ACTIVITY_LABELS[activityLevel] || activityLevel}`);

  // Medical conditions
  const medicalParts: string[] = [];
  if (diabetesType) medicalParts.push(`Diabetes: ${diabetesType}`);
  if (medicalNotes) medicalParts.push(medicalNotes);

  // Today's food intake context
  let nutritionContext = "";
  let nutritionWarning = "";
  if (todayCalories !== undefined) {
    nutritionContext = `Today's food intake so far: ${todayCalories} kcal, ${todayProtein ?? 0}g protein, ${todayCarbs ?? 0}g carbs`;
    if (dailyCalorieTarget) nutritionContext += ` (daily target: ${dailyCalorieTarget} kcal)`;
    if (dailyProteinTarget) nutritionContext += `, ${dailyProteinTarget}g protein target`;

    // Flag low calorie/protein situations
    const calTarget = dailyCalorieTarget || 2000;
    const protTarget = dailyProteinTarget || 100;
    const calPct = todayCalories / calTarget;
    const protPct = (todayProtein ?? 0) / protTarget;

    if (todayCalories < 300) {
      nutritionWarning = `CRITICAL: The user has eaten almost nothing today (only ${todayCalories} kcal). You MUST include a nutritionNote warning them that their energy levels may be very low, and recommend eating at least ${Math.round(calTarget * 0.3)} calories and ${Math.round(protTarget * 0.25)}g protein before this workout. Suggest specific foods like a banana with peanut butter, Greek yogurt, or a protein shake.`;
    } else if (calPct < 0.4) {
      nutritionWarning = `NOTE: The user has only consumed ${Math.round(calPct * 100)}% of their daily calorie target today. Include a nutritionNote suggesting they eat a small pre-workout snack (200-300 calories with 15-25g protein) before training for optimal performance.`;
    } else if (protPct < 0.3 && fitnessGoal === "build_muscle") {
      nutritionWarning = `NOTE: The user is trying to build muscle but has only consumed ${todayProtein ?? 0}g protein today (target: ${dailyProteinTarget}g). Include a nutritionNote recommending a protein-rich pre-workout meal.`;
    }
  } else {
    nutritionWarning = `NOTE: No food log data is available for today. Include a nutritionNote with general pre-workout nutrition advice based on their goal (${GOAL_LABELS[fitnessGoal] || fitnessGoal}).`;
  }

  // Recent workout history for variety
  const recentNames = recentWorkouts
    .slice(0, 5)
    .map((w) => w.exerciseName)
    .join(", ");

  const medicalSection = medicalParts.length > 0
    ? `\nMedical conditions: ${medicalParts.join(", ")}\nIMPORTANT: Tailor the workout to be safe for these conditions. Include modifications and safety notes.`
    : "";

  const recentSection = recentNames
    ? `\nRecent workouts (avoid repeating these exact exercises): ${recentNames}`
    : "";

  const customSection = customRequest
    ? `\nUser's specific request: "${customRequest}"`
    : "";

  const nutritionSection = nutritionContext
    ? `\nToday's nutrition: ${nutritionContext}`
    : "";

  const workoutRule = WORKOUT_TYPE_RULES[workoutType] || WORKOUT_TYPE_RULES.full_body;
  const goalGuidance = GOAL_EXERCISE_GUIDANCE[fitnessGoal] || GOAL_EXERCISE_GUIDANCE.maintain;

  const prompt = `You are an expert personal trainer and exercise physiologist. Generate a detailed, safe, and personalized workout plan.

USER PROFILE:
${profileParts.join("\n")}${medicalSection}${recentSection}${nutritionSection}${customSection}

WORKOUT REQUEST:
- Type: ${workoutType.replace(/_/g, " ")} — ${workoutRule}
- Duration: ${durationMins} minutes total (include warm-up and cool-down within this time)
- Intensity: ${intensity}

GOAL-BASED CUSTOMIZATION:
${goalGuidance}

${nutritionWarning}

CRITICAL RULES — YOU MUST FOLLOW THESE:
1. The workout type is "${workoutType.replace(/_/g, " ")}". Do NOT substitute a different workout type. If the user selected "strength", give them weight lifting. If they selected "upper body", give them upper body exercises ONLY.
2. Personalize the difficulty, weights, and rep ranges based on the user's age, weight, and fitness goal.
3. Always include a warm-up section (5 min) and cool-down section (5 min) within the total duration.
4. The "nutritionNote" field MUST contain personalized pre-workout nutrition advice based on today's food intake.
5. If the user has diabetes, include blood sugar management notes.

Return ONLY valid JSON matching this exact structure (no markdown, no code blocks):
{
  "title": "string (specific, e.g. 'Upper Body Strength — Chest & Back Focus')",
  "overview": "string (2-3 sentences: what this workout is, why it suits THIS specific user based on their profile)",
  "totalDurationMins": number,
  "difficulty": "beginner" | "intermediate" | "advanced",
  "focusArea": "string (e.g. 'Upper Body Strength', 'Fat-Burning Cardio', 'Lower Body Power')",
  "estimatedCalories": number,
  "nutritionNote": "string (pre-workout nutrition advice based on today's food intake and their goal)",
  "weeklySchedule": "string (how often to do this workout per week)",
  "safetyNotes": ["string"],
  "progressionTips": ["string"],
  "sections": [
    {
      "name": "string (e.g. 'Warm-Up', 'Main Workout', 'Cool-Down')",
      "durationMins": number,
      "notes": "string (optional coaching notes)",
      "exercises": [
        {
          "name": "string (specific exercise name)",
          "sets": number (for strength exercises),
          "reps": "string (e.g. '8-12', '15', '30 seconds', 'to failure')",
          "weight": "string (e.g. 'bodyweight', '60-70% 1RM', 'moderate — challenge yourself')",
          "durationSecs": number (for timed exercises),
          "restSecs": number,
          "muscleGroup": "string (specific muscle group targeted)",
          "instructions": "string (clear 1-2 sentence form cue)",
          "modifications": "string (easier/harder variation or medical modification)"
        }
      ]
    }
  ]
}`;

  try {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(ENV.geminiApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // Extract JSON from response (strip any markdown code fences)
    const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in Gemini response");

    const plan = JSON.parse(jsonMatch[0]) as AIWorkoutPlan;

    // Validate required fields
    if (!plan.title || !plan.sections || !Array.isArray(plan.sections)) {
      throw new Error("Invalid plan structure from Gemini");
    }

    return plan;
  } catch (error) {
    console.error("Gemini workout plan generation failed:", error);
    // Return a sensible fallback plan that RESPECTS the workout type
    return generateFallbackPlan(request);
  }
}

function generateFallbackPlan(request: WorkoutPlanRequest): AIWorkoutPlan {
  const {
    workoutType = "full_body",
    durationMins = 45,
    fitnessGoal = "maintain",
    ageYears,
    weightLbs,
    todayCalories,
    dailyCalorieTarget,
  } = request;

  const mainDuration = durationMins - 10; // subtract warm-up + cool-down

  // Determine difficulty based on age and activity
  const difficulty: "beginner" | "intermediate" | "advanced" =
    ageYears && ageYears > 55 ? "beginner" :
    fitnessGoal === "build_muscle" ? "intermediate" : "beginner";

  // Nutrition note
  let nutritionNote = "Eat a balanced meal 1-2 hours before training with carbohydrates for energy and protein for muscle support.";
  if (todayCalories !== undefined && todayCalories < 300) {
    const calTarget = dailyCalorieTarget || 2000;
    nutritionNote = `Your calorie intake today is very low (${todayCalories} kcal). Please eat at least ${Math.round(calTarget * 0.3)} calories before this workout — try a banana with peanut butter, Greek yogurt with fruit, or a protein shake to fuel your training.`;
  } else if (fitnessGoal === "build_muscle") {
    nutritionNote = "For muscle building, aim to eat 25-40g of protein and 30-50g of carbs 1-2 hours before training. A chicken breast with rice or a protein shake with a banana works well.";
  } else if (fitnessGoal === "lose_fat") {
    nutritionNote = "For fat loss, a light pre-workout snack (150-200 cal) with protein helps preserve muscle. Try Greek yogurt or a small protein shake. Avoid training completely fasted for intense sessions.";
  }

  const warmUp: WorkoutSection = {
    name: "Warm-Up",
    durationMins: 5,
    notes: "Light movement to raise heart rate and prepare joints",
    exercises: [
      { name: "Arm Circles", durationSecs: 30, muscleGroup: "Shoulders", instructions: "15 seconds forward, 15 seconds backward. Gradually increase circle size." },
      { name: "Hip Circles", durationSecs: 30, muscleGroup: "Hips/Core", instructions: "Hands on hips, make large circles. 15 seconds each direction." },
      { name: "Leg Swings", reps: "10 each leg", muscleGroup: "Hips/Hamstrings", instructions: "Hold a wall for balance, swing each leg forward and back with control." },
      { name: "Jumping Jacks", durationSecs: 60, muscleGroup: "Full Body", instructions: "Keep a steady rhythm, arms fully extended overhead. Light pace." },
    ],
  };

  const coolDown: WorkoutSection = {
    name: "Cool-Down",
    durationMins: 5,
    exercises: [
      { name: "Standing Quad Stretch", durationSecs: 30, muscleGroup: "Quads", instructions: "Hold foot behind you, keep knees together. Hold 30 seconds each side." },
      { name: "Chest Doorway Stretch", durationSecs: 30, muscleGroup: "Chest/Shoulders", instructions: "Place forearm on doorframe at 90°, lean forward gently." },
      { name: "Child's Pose", durationSecs: 60, muscleGroup: "Back/Hips", instructions: "Sit back on heels, arms extended forward, breathe deeply into the stretch." },
    ],
  };

  // ── STRENGTH ──────────────────────────────────────────────────────────────
  if (workoutType === "strength" || workoutType === "full_body") {
    const isHeavy = fitnessGoal === "build_muscle";
    const reps = isHeavy ? "6-8" : fitnessGoal === "lose_fat" ? "12-15" : "10-12";
    const sets = isHeavy ? 4 : 3;
    const rest = isHeavy ? 90 : 60;
    const weightNote = isHeavy ? "heavy (75-85% 1RM)" : fitnessGoal === "lose_fat" ? "moderate (50-65% 1RM)" : "moderate (65-75% 1RM)";

    return {
      title: fitnessGoal === "build_muscle" ? "Full Body Strength — Compound Lifts" : "Full Body Strength Circuit",
      overview: `A ${difficulty} full body strength workout using compound barbell and dumbbell movements. ${fitnessGoal === "build_muscle" ? "Heavy compound lifts with progressive overload for maximum muscle growth." : fitnessGoal === "lose_fat" ? "Higher rep ranges and shorter rest periods to maximize calorie burn while building strength." : "Balanced strength training to maintain and improve overall fitness."}`,
      totalDurationMins: durationMins,
      difficulty,
      focusArea: "Full Body Strength",
      estimatedCalories: Math.round(durationMins * (isHeavy ? 5 : 6)),
      nutritionNote,
      weeklySchedule: isHeavy ? "3 days per week (Mon/Wed/Fri) with rest days between sessions" : "3-4 days per week",
      safetyNotes: ["Warm up thoroughly before lifting", "Use a spotter for heavy compound lifts", "Stop if you feel sharp pain", "Keep core braced during all lifts"],
      progressionTips: [
        isHeavy ? "Increase weight by 5 lbs when you can complete all reps with perfect form" : "Reduce rest time by 5 seconds each week to increase intensity",
        "Track your lifts in a notebook or app to ensure progressive overload",
      ],
      sections: [
        warmUp,
        {
          name: "Main Workout",
          durationMins: mainDuration,
          notes: isHeavy ? `Rest ${rest} seconds between sets` : `Superset exercises A+B, rest 60 seconds between pairs`,
          exercises: [
            { name: "Barbell Back Squat", sets, reps, weight: weightNote, restSecs: rest, muscleGroup: "Quads, Glutes, Core", instructions: "Feet shoulder-width apart, bar on upper traps, descend until thighs parallel to floor, drive through heels.", modifications: "Goblet squat with dumbbell if no barbell available" },
            { name: "Barbell Bench Press", sets, reps, weight: weightNote, restSecs: rest, muscleGroup: "Chest, Triceps, Shoulders", instructions: "Grip slightly wider than shoulder-width, lower bar to mid-chest with control, press explosively.", modifications: "Dumbbell press for more shoulder-friendly variation" },
            { name: "Barbell Bent-Over Row", sets, reps, weight: weightNote, restSecs: rest, muscleGroup: "Back, Biceps, Rear Delts", instructions: "Hinge at hips 45°, keep back flat, pull bar to lower chest, squeeze shoulder blades.", modifications: "Seated cable row if lower back is sensitive" },
            { name: "Dumbbell Shoulder Press", sets, reps: isHeavy ? "8-10" : "12-15", weight: "moderate", restSecs: rest, muscleGroup: "Shoulders, Triceps", instructions: "Press dumbbells directly overhead, keep core tight, avoid arching lower back.", modifications: "Seated version for better stability" },
            { name: "Romanian Deadlift", sets, reps, weight: weightNote, restSecs: rest, muscleGroup: "Hamstrings, Glutes, Lower Back", instructions: "Hinge at hips with soft knees, feel stretch in hamstrings, keep bar close to legs.", modifications: "Reduce range of motion if lower back is tight" },
          ],
        },
        coolDown,
      ],
    };
  }

  // ── UPPER BODY ────────────────────────────────────────────────────────────
  if (workoutType === "upper_body") {
    const isHeavy = fitnessGoal === "build_muscle";
    const reps = isHeavy ? "6-10" : "12-15";
    const sets = isHeavy ? 4 : 3;
    const rest = isHeavy ? 90 : 60;

    return {
      title: isHeavy ? "Upper Body Strength — Push & Pull" : "Upper Body Sculpting Circuit",
      overview: `An upper body workout targeting chest, back, shoulders, biceps, and triceps. ${isHeavy ? "Heavy compound movements with isolation finishers for maximum upper body development." : "Moderate weight with higher reps to tone and define upper body muscles."}`,
      totalDurationMins: durationMins,
      difficulty,
      focusArea: "Upper Body Strength",
      estimatedCalories: Math.round(durationMins * 5),
      nutritionNote,
      weeklySchedule: "2-3 times per week, paired with lower body days",
      safetyNotes: ["Warm up rotator cuffs before pressing", "Don't flare elbows excessively on bench press", "Control the weight on the way down"],
      progressionTips: ["Add 2.5-5 lbs per week on main lifts", "Focus on mind-muscle connection for isolation exercises"],
      sections: [
        warmUp,
        {
          name: "Push — Chest & Shoulders",
          durationMins: Math.round(mainDuration * 0.5),
          exercises: [
            { name: "Barbell Bench Press", sets, reps, weight: isHeavy ? "heavy (75-85% 1RM)" : "moderate", restSecs: rest, muscleGroup: "Chest, Triceps, Front Delts", instructions: "Lower bar to mid-chest, press explosively. Keep shoulder blades retracted.", modifications: "Dumbbell press or push-ups" },
            { name: "Incline Dumbbell Press", sets: 3, reps: isHeavy ? "8-10" : "12-15", weight: "moderate", restSecs: rest, muscleGroup: "Upper Chest, Shoulders", instructions: "Set bench to 30-45°, press dumbbells up and slightly inward.", modifications: "Flat dumbbell press" },
            { name: "Lateral Raises", sets: 3, reps: "12-15", weight: "light-moderate", restSecs: 45, muscleGroup: "Side Delts", instructions: "Slight bend in elbows, raise arms to shoulder height, lead with elbows.", modifications: "Cable lateral raises for constant tension" },
          ],
        },
        {
          name: "Pull — Back & Biceps",
          durationMins: Math.round(mainDuration * 0.5),
          exercises: [
            { name: "Pull-Ups / Lat Pulldown", sets, reps: isHeavy ? "6-8" : "10-12", weight: isHeavy ? "bodyweight or weighted" : "moderate", restSecs: rest, muscleGroup: "Lats, Biceps, Rear Delts", instructions: "Pull elbows down and back, squeeze lats at bottom. Full range of motion.", modifications: "Lat pulldown machine if pull-ups are too difficult" },
            { name: "Seated Cable Row", sets: 3, reps: "10-12", weight: "moderate", restSecs: 60, muscleGroup: "Mid Back, Rhomboids, Biceps", instructions: "Keep chest up, pull handle to lower chest, squeeze shoulder blades together.", modifications: "Dumbbell bent-over row" },
            { name: "Barbell Bicep Curl", sets: 3, reps: "10-12", weight: "moderate", restSecs: 45, muscleGroup: "Biceps", instructions: "Keep elbows pinned to sides, curl bar to shoulder height, lower with control.", modifications: "Dumbbell curls for unilateral work" },
            { name: "Tricep Rope Pushdown", sets: 3, reps: "12-15", weight: "moderate", restSecs: 45, muscleGroup: "Triceps", instructions: "Keep elbows at sides, push rope down and slightly outward, fully extend arms.", modifications: "Overhead tricep extension with dumbbell" },
          ],
        },
        coolDown,
      ],
    };
  }

  // ── LOWER BODY ────────────────────────────────────────────────────────────
  if (workoutType === "lower_body") {
    return {
      title: fitnessGoal === "build_muscle" ? "Lower Body Power — Squat & Deadlift Focus" : "Lower Body Strength & Tone",
      overview: `A lower body workout targeting quads, hamstrings, glutes, and calves. ${fitnessGoal === "build_muscle" ? "Heavy compound movements for maximum lower body strength and size." : "Moderate weight with controlled movements to strengthen and tone the lower body."}`,
      totalDurationMins: durationMins,
      difficulty,
      focusArea: "Lower Body Strength",
      estimatedCalories: Math.round(durationMins * 6),
      nutritionNote,
      weeklySchedule: "2-3 times per week, paired with upper body days",
      safetyNotes: ["Warm up hips and knees thoroughly", "Keep knees tracking over toes during squats", "Brace core on all deadlift variations"],
      progressionTips: ["Squat and deadlift are your primary strength builders — prioritize progressive overload on these", "Add single-leg work for balance and injury prevention"],
      sections: [
        warmUp,
        {
          name: "Main Workout",
          durationMins: mainDuration,
          exercises: [
            { name: "Barbell Back Squat", sets: 4, reps: fitnessGoal === "build_muscle" ? "6-8" : "10-12", weight: fitnessGoal === "build_muscle" ? "heavy (75-85% 1RM)" : "moderate", restSecs: 90, muscleGroup: "Quads, Glutes, Core", instructions: "Feet shoulder-width apart, descend until thighs parallel to floor, drive through heels.", modifications: "Goblet squat or leg press" },
            { name: "Romanian Deadlift", sets: 4, reps: "8-10", weight: "moderate-heavy", restSecs: 90, muscleGroup: "Hamstrings, Glutes, Lower Back", instructions: "Hinge at hips, keep bar close to legs, feel stretch in hamstrings.", modifications: "Dumbbell RDL" },
            { name: "Leg Press", sets: 3, reps: "12-15", weight: "moderate", restSecs: 60, muscleGroup: "Quads, Glutes", instructions: "Feet shoulder-width on platform, lower until 90° knee angle, press through heels.", modifications: "Bodyweight squats" },
            { name: "Walking Lunges", sets: 3, reps: "12 each leg", weight: "bodyweight or light dumbbells", restSecs: 60, muscleGroup: "Quads, Glutes, Hamstrings", instructions: "Step forward, lower back knee toward floor, push through front heel to stand.", modifications: "Stationary lunges for balance" },
            { name: "Standing Calf Raises", sets: 3, reps: "15-20", weight: "bodyweight or machine", restSecs: 45, muscleGroup: "Calves", instructions: "Rise up on toes, pause at top, lower slowly. Full range of motion.", modifications: "Seated calf raises" },
          ],
        },
        coolDown,
      ],
    };
  }

  // ── CARDIO ────────────────────────────────────────────────────────────────
  if (workoutType === "cardio") {
    return {
      title: fitnessGoal === "lose_fat" ? "Fat-Burning Cardio — Interval Training" : "Steady-State Cardio Endurance",
      overview: `A cardiovascular workout designed to improve endurance and ${fitnessGoal === "lose_fat" ? "maximize calorie burn for fat loss" : "maintain cardiovascular health"}. Mix of steady-state and interval training.`,
      totalDurationMins: durationMins,
      difficulty,
      focusArea: "Cardiovascular Endurance",
      estimatedCalories: Math.round(durationMins * 8),
      nutritionNote,
      weeklySchedule: fitnessGoal === "lose_fat" ? "4-5 days per week" : "3-4 days per week",
      safetyNotes: ["Stay hydrated — drink water before, during, and after", "Monitor heart rate — aim for 65-80% max HR for fat burning", "Slow down if you cannot hold a conversation"],
      progressionTips: ["Increase duration by 5 minutes each week", "Add one interval session per week as fitness improves"],
      sections: [
        { name: "Warm-Up", durationMins: 5, exercises: [{ name: "Easy Walk/Light Jog", durationSecs: 300, muscleGroup: "Full Body", instructions: "Start at 50% effort, gradually increase pace over 5 minutes." }] },
        {
          name: "Main Cardio",
          durationMins: mainDuration,
          notes: fitnessGoal === "lose_fat" ? "Alternate 2 min moderate pace / 1 min high intensity" : "Maintain steady pace at 65-70% max heart rate",
          exercises: [
            { name: "Treadmill / Outdoor Run", durationSecs: mainDuration * 60, muscleGroup: "Full Body", instructions: fitnessGoal === "lose_fat" ? "Alternate between 6-7 mph (moderate) and 8-9 mph (high intensity) every 2-3 minutes." : "Maintain a comfortable conversational pace. Focus on breathing rhythm.", modifications: "Elliptical or cycling for low-impact alternative" },
          ],
        },
        { name: "Cool-Down", durationMins: 5, exercises: [{ name: "Easy Walk", durationSecs: 300, muscleGroup: "Full Body", instructions: "Slow to a comfortable walk, let heart rate return to normal." }, { name: "Standing Forward Fold", durationSecs: 45, muscleGroup: "Hamstrings, Back", instructions: "Hinge at hips, let arms hang, breathe into the stretch." }] },
      ],
    };
  }

  // ── HIIT ──────────────────────────────────────────────────────────────────
  if (workoutType === "hiit") {
    return {
      title: "HIIT Circuit — High Intensity Intervals",
      overview: "A high-intensity interval training circuit alternating between maximum effort bursts and active recovery. Maximizes calorie burn and improves cardiovascular fitness in minimal time.",
      totalDurationMins: durationMins,
      difficulty: "intermediate",
      focusArea: "HIIT / Fat Burning",
      estimatedCalories: Math.round(durationMins * 10),
      nutritionNote,
      weeklySchedule: "2-3 days per week — allow 48 hours recovery between sessions",
      safetyNotes: ["Only do HIIT if you have a baseline level of fitness", "Modify exercises if you feel dizzy or short of breath", "Stay hydrated"],
      progressionTips: ["Increase work interval by 5 seconds each week", "Add an extra round when current rounds feel manageable"],
      sections: [
        warmUp,
        {
          name: "HIIT Circuit",
          durationMins: mainDuration,
          notes: "40 seconds work / 20 seconds rest. Complete 4-5 rounds.",
          exercises: [
            { name: "Burpees", durationSecs: 40, restSecs: 20, muscleGroup: "Full Body", instructions: "Squat down, jump feet to plank, do a push-up, jump feet in, jump up with arms overhead.", modifications: "Step feet back instead of jumping" },
            { name: "Jump Squats", durationSecs: 40, restSecs: 20, muscleGroup: "Quads, Glutes", instructions: "Squat to parallel, explode upward, land softly with bent knees.", modifications: "Regular squats without the jump" },
            { name: "Mountain Climbers", durationSecs: 40, restSecs: 20, muscleGroup: "Core, Shoulders, Cardio", instructions: "In plank position, drive knees alternately toward chest as fast as possible.", modifications: "Slow the pace for lower intensity" },
            { name: "High Knees", durationSecs: 40, restSecs: 20, muscleGroup: "Cardio, Core, Hip Flexors", instructions: "Drive knees up to waist height, pump arms, stay on balls of feet.", modifications: "March in place if impact is too high" },
            { name: "Push-Up to Shoulder Tap", durationSecs: 40, restSecs: 20, muscleGroup: "Chest, Shoulders, Core", instructions: "Do a push-up, then tap each shoulder alternately. Keep hips stable.", modifications: "Push-ups from knees" },
          ],
        },
        coolDown,
      ],
    };
  }

  // ── CORE ──────────────────────────────────────────────────────────────────
  if (workoutType === "core") {
    return {
      title: "Core Strength & Stability",
      overview: "A focused core workout targeting abs, obliques, and lower back for improved stability, posture, and athletic performance.",
      totalDurationMins: durationMins,
      difficulty,
      focusArea: "Core & Abs",
      estimatedCalories: Math.round(durationMins * 4),
      nutritionNote,
      weeklySchedule: "3-4 days per week — can be added as a finisher to other workouts",
      safetyNotes: ["Stop if you feel lower back pain", "Breathe out on exertion", "Quality over quantity — slow controlled reps"],
      progressionTips: ["Increase plank hold time by 5 seconds each week", "Add resistance (weight plate) to crunches when bodyweight becomes easy"],
      sections: [
        warmUp,
        {
          name: "Core Circuit",
          durationMins: mainDuration,
          notes: "Perform each exercise for the specified time/reps, rest 30 seconds between exercises",
          exercises: [
            { name: "Plank", durationSecs: 60, muscleGroup: "Core, Shoulders", instructions: "Forearms on floor, body in straight line from head to heels. Squeeze glutes and abs.", modifications: "Knees on floor for easier version" },
            { name: "Bicycle Crunches", reps: "20 each side", muscleGroup: "Abs, Obliques", instructions: "Bring opposite elbow to knee, fully extend other leg. Slow and controlled.", modifications: "Regular crunches" },
            { name: "Dead Bug", reps: "10 each side", muscleGroup: "Deep Core, Lower Back", instructions: "Lie on back, arms up, knees at 90°. Lower opposite arm and leg simultaneously while keeping lower back pressed to floor.", modifications: "Only move arms or only move legs" },
            { name: "Russian Twists", reps: "20 each side", muscleGroup: "Obliques", instructions: "Sit at 45°, feet off floor, rotate torso side to side. Touch floor each side.", modifications: "Keep feet on floor for easier version" },
            { name: "Leg Raises", reps: "15", muscleGroup: "Lower Abs, Hip Flexors", instructions: "Lie flat, keep legs straight, raise to 90° then lower slowly without touching floor.", modifications: "Bent-knee raises" },
          ],
        },
        coolDown,
      ],
    };
  }

  // ── FLEXIBILITY ───────────────────────────────────────────────────────────
  return {
    title: "Flexibility & Mobility Flow",
    overview: "A full-body stretching and mobility session to improve flexibility, reduce muscle soreness, and enhance range of motion.",
    totalDurationMins: durationMins,
    difficulty: "beginner",
    focusArea: "Flexibility & Mobility",
    estimatedCalories: Math.round(durationMins * 2),
    nutritionNote,
    weeklySchedule: "Daily — especially after strength or cardio sessions",
    safetyNotes: ["Never stretch to the point of pain", "Hold each stretch for 30-60 seconds", "Breathe deeply throughout"],
    progressionTips: ["Aim to increase range of motion by 10% each week", "Consistency is key — daily stretching yields the best results"],
    sections: [
      { name: "Warm-Up Movement", durationMins: 5, exercises: [{ name: "Cat-Cow", reps: "10 slow", muscleGroup: "Spine", instructions: "On hands and knees, alternate arching and rounding your spine with breath." }] },
      {
        name: "Full Body Stretch",
        durationMins: durationMins - 5,
        exercises: [
          { name: "Standing Forward Fold", durationSecs: 60, muscleGroup: "Hamstrings, Lower Back", instructions: "Hinge at hips, let arms hang, bend knees slightly if needed." },
          { name: "Hip Flexor Lunge Stretch", durationSecs: 45, muscleGroup: "Hip Flexors, Quads", instructions: "Low lunge position, back knee on floor, push hips forward." },
          { name: "Pigeon Pose", durationSecs: 60, muscleGroup: "Glutes, Hip Rotators", instructions: "Front shin parallel to mat, lean forward over front leg." },
          { name: "Doorway Chest Stretch", durationSecs: 45, muscleGroup: "Chest, Shoulders", instructions: "Forearm on doorframe at 90°, lean forward gently." },
          { name: "Child's Pose", durationSecs: 60, muscleGroup: "Back, Hips, Shoulders", instructions: "Sit back on heels, arms extended forward, breathe into your back." },
          { name: "Seated Spinal Twist", durationSecs: 45, muscleGroup: "Spine, Obliques", instructions: "Sit cross-legged, place hand on opposite knee, twist gently, look over shoulder." },
        ],
      },
    ],
  };
}
