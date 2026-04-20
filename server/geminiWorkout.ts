/**
 * Gemini AI Workout Plan Generator
 * Generates personalized workout plans based on user profile:
 * age, height, weight, fitness goal, activity level, medical conditions
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
}

const ACTIVITY_LABELS: Record<string, string> = {
  sedentary: "sedentary (desk job, little exercise)",
  lightly_active: "lightly active (1-3 days/week exercise)",
  moderately_active: "moderately active (3-5 days/week exercise)",
  very_active: "very active (6-7 days/week exercise)",
  extremely_active: "extremely active (athlete/physical job)",
};

const GOAL_LABELS: Record<string, string> = {
  lose_fat: "lose body fat",
  build_muscle: "build muscle and strength",
  maintain: "maintain current fitness",
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
  } = request;

  // Build user context string
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
  if (diabetesType) {
    medicalParts.push(`Diabetes: ${diabetesType}`);
  }
  if (medicalNotes) {
    medicalParts.push(medicalNotes);
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
    ? `\nRecent workouts (for variety): ${recentNames}`
    : "";

  const customSection = customRequest
    ? `\nUser's specific request: "${customRequest}"`
    : "";

  const prompt = `You are an expert personal trainer and exercise physiologist. Generate a detailed, safe, and effective workout plan.

USER PROFILE:
${profileParts.join("\n")}${medicalSection}${recentSection}${customSection}

WORKOUT REQUEST:
- Type: ${workoutType.replace(/_/g, " ")}
- Duration: ${durationMins} minutes
- Intensity: ${intensity}

Generate a complete workout plan. For strength exercises, include specific sets, reps, rest periods, and muscle groups targeted. For cardio, include intervals or steady-state breakdown with effort levels. Always include warm-up and cool-down.

Return ONLY valid JSON matching this exact structure:
{
  "title": "string",
  "overview": "string (2-3 sentences describing the workout and why it suits this user)",
  "totalDurationMins": number,
  "difficulty": "beginner" | "intermediate" | "advanced",
  "focusArea": "string (e.g. 'Upper Body', 'Full Body Strength', 'Fat Burning Cardio')",
  "estimatedCalories": number,
  "weeklySchedule": "string (optional recommendation for how often to do this)",
  "safetyNotes": ["string"],
  "progressionTips": ["string"],
  "sections": [
    {
      "name": "string (e.g. 'Warm-Up', 'Main Workout', 'Cool-Down')",
      "durationMins": number,
      "notes": "string (optional)",
      "exercises": [
        {
          "name": "string",
          "sets": number (optional, for strength),
          "reps": "string (optional, e.g. '8-12' or '30 seconds')",
          "weight": "string (optional, e.g. 'bodyweight', 'light', 'moderate', '60-70% 1RM')",
          "durationSecs": number (optional, for timed exercises),
          "restSecs": number (optional),
          "muscleGroup": "string",
          "instructions": "string (clear 1-2 sentence form cue)",
          "modifications": "string (optional, for medical conditions or beginners)"
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

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in Gemini response");

    const plan = JSON.parse(jsonMatch[0]) as AIWorkoutPlan;

    // Validate required fields
    if (!plan.title || !plan.sections || !Array.isArray(plan.sections)) {
      throw new Error("Invalid plan structure from Gemini");
    }

    return plan;
  } catch (error) {
    console.error("Gemini workout plan generation failed:", error);
    // Return a sensible fallback plan
    return generateFallbackPlan(request);
  }
}

function generateFallbackPlan(request: WorkoutPlanRequest): AIWorkoutPlan {
  const { workoutType = "full_body", durationMins = 45, fitnessGoal = "maintain" } = request;

  const isStrength = ["strength", "upper_body", "lower_body", "full_body"].includes(workoutType);

  if (isStrength && fitnessGoal === "build_muscle") {
    return {
      title: "Full Body Strength Training",
      overview: "A balanced strength workout targeting all major muscle groups. Focus on controlled movements and progressive overload.",
      totalDurationMins: durationMins,
      difficulty: "intermediate",
      focusArea: "Full Body Strength",
      estimatedCalories: Math.round(durationMins * 6),
      weeklySchedule: "3 days per week with rest days between sessions",
      safetyNotes: ["Warm up thoroughly before lifting", "Use a spotter for heavy compound lifts", "Stop if you feel sharp pain"],
      progressionTips: ["Increase weight by 5 lbs when you can complete all reps with good form", "Track your lifts to ensure progressive overload"],
      sections: [
        {
          name: "Warm-Up",
          durationMins: 5,
          notes: "Light cardio and dynamic stretching",
          exercises: [
            { name: "Jumping Jacks", durationSecs: 60, muscleGroup: "Full Body", instructions: "Keep a steady rhythm, arms fully extended overhead." },
            { name: "Arm Circles", durationSecs: 30, muscleGroup: "Shoulders", instructions: "Forward 15 seconds, backward 15 seconds." },
            { name: "Leg Swings", reps: "10 each leg", muscleGroup: "Hips", instructions: "Hold a wall for balance, swing leg forward and back." },
          ],
        },
        {
          name: "Main Workout",
          durationMins: durationMins - 10,
          exercises: [
            { name: "Barbell Squat", sets: 4, reps: "8-10", weight: "moderate (60-70% 1RM)", restSecs: 90, muscleGroup: "Quads, Glutes", instructions: "Feet shoulder-width apart, chest up, descend until thighs are parallel to floor.", modifications: "Use goblet squat with lighter weight if needed" },
            { name: "Bench Press", sets: 4, reps: "8-10", weight: "moderate", restSecs: 90, muscleGroup: "Chest, Triceps", instructions: "Lower bar to chest with control, press explosively upward.", modifications: "Use dumbbells for more shoulder-friendly variation" },
            { name: "Bent-Over Row", sets: 3, reps: "10-12", weight: "moderate", restSecs: 75, muscleGroup: "Back, Biceps", instructions: "Hinge at hips, keep back flat, pull bar to lower chest.", modifications: "Use seated cable row if lower back is sensitive" },
            { name: "Overhead Press", sets: 3, reps: "10-12", weight: "light-moderate", restSecs: 75, muscleGroup: "Shoulders, Triceps", instructions: "Press bar directly overhead, keep core tight.", modifications: "Use dumbbells for more natural shoulder movement" },
            { name: "Romanian Deadlift", sets: 3, reps: "10-12", weight: "moderate", restSecs: 75, muscleGroup: "Hamstrings, Glutes", instructions: "Hinge at hips with soft knees, feel stretch in hamstrings.", modifications: "Reduce range of motion if lower back is tight" },
          ],
        },
        {
          name: "Cool-Down",
          durationMins: 5,
          exercises: [
            { name: "Standing Quad Stretch", durationSecs: 30, muscleGroup: "Quads", instructions: "Hold foot behind you, keep knees together." },
            { name: "Chest Doorway Stretch", durationSecs: 30, muscleGroup: "Chest", instructions: "Place forearm on doorframe, lean forward gently." },
            { name: "Child's Pose", durationSecs: 60, muscleGroup: "Back, Hips", instructions: "Sit back on heels, arms extended forward, breathe deeply." },
          ],
        },
      ],
    };
  }

  // Cardio/fat loss fallback
  return {
    title: "Fat-Burning Cardio Circuit",
    overview: "A calorie-burning cardio workout mixing steady-state and interval training for maximum fat loss.",
    totalDurationMins: durationMins,
    difficulty: "intermediate",
    focusArea: "Cardio & Fat Burning",
    estimatedCalories: Math.round(durationMins * 8),
    weeklySchedule: "4-5 days per week",
    safetyNotes: ["Stay hydrated throughout", "Monitor heart rate — aim for 65-80% max HR", "Slow down if you cannot hold a conversation"],
    progressionTips: ["Increase interval intensity each week", "Add 5 minutes to total duration monthly"],
    sections: [
      {
        name: "Warm-Up",
        durationMins: 5,
        exercises: [
          { name: "March in Place", durationSecs: 60, muscleGroup: "Full Body", instructions: "Lift knees to hip height, swing arms naturally." },
          { name: "Hip Circles", durationSecs: 30, muscleGroup: "Hips", instructions: "Hands on hips, make large circles in both directions." },
          { name: "Shoulder Rolls", durationSecs: 30, muscleGroup: "Shoulders", instructions: "Roll shoulders forward then backward, 10 each direction." },
        ],
      },
      {
        name: "Cardio Intervals",
        durationMins: durationMins - 10,
        notes: "Alternate 40 seconds work / 20 seconds rest for each exercise",
        exercises: [
          { name: "High Knees", durationSecs: 40, restSecs: 20, muscleGroup: "Cardio, Core", instructions: "Drive knees up to waist height, pump arms.", modifications: "March in place if impact is too high" },
          { name: "Burpees", durationSecs: 40, restSecs: 20, muscleGroup: "Full Body", instructions: "Squat down, jump feet back to plank, do a push-up, jump feet in, jump up.", modifications: "Step feet back instead of jumping" },
          { name: "Jump Squats", durationSecs: 40, restSecs: 20, muscleGroup: "Quads, Glutes", instructions: "Squat down, explode upward, land softly.", modifications: "Regular squats without the jump" },
          { name: "Mountain Climbers", durationSecs: 40, restSecs: 20, muscleGroup: "Core, Cardio", instructions: "In plank position, drive knees alternately toward chest.", modifications: "Slow the pace for lower intensity" },
          { name: "Jumping Jacks", durationSecs: 40, restSecs: 20, muscleGroup: "Full Body", instructions: "Full range of motion, arms fully overhead.", modifications: "Step side to side instead of jumping" },
        ],
      },
      {
        name: "Cool-Down",
        durationMins: 5,
        exercises: [
          { name: "Standing Forward Fold", durationSecs: 45, muscleGroup: "Hamstrings, Back", instructions: "Hinge at hips, let arms hang, breathe into the stretch." },
          { name: "Hip Flexor Stretch", durationSecs: 30, muscleGroup: "Hip Flexors", instructions: "Lunge position, lower back knee, push hips forward." },
          { name: "Seated Spinal Twist", durationSecs: 30, muscleGroup: "Spine, Hips", instructions: "Sit cross-legged, place hand on opposite knee, twist gently." },
        ],
      },
    ],
  };
}
