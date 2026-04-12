import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChefHat, Flame, Zap, Wheat } from "lucide-react";

interface MealSuggestionsProps {
  caloriesRemaining: number;
  proteinRemaining: number;
  carbsRemaining: number;
  fatRemaining: number;
}

export function MealSuggestions({
  caloriesRemaining,
  proteinRemaining,
  carbsRemaining,
  fatRemaining,
}: MealSuggestionsProps) {
  const [selectedCategory, setSelectedCategory] = useState<"all" | "protein" | "carb" | "fat" | "balanced" | "snack">("all");

  // Fetch general suggestions
  const { data: generalSuggestions, isLoading: isLoadingGeneral } = trpc.food.getSuggestions.useQuery(
    {
      caloriesRemaining,
      proteinRemaining,
      carbsRemaining,
      fatRemaining,
      limit: 5,
    },
    {
      enabled: selectedCategory === "all" && caloriesRemaining > 0,
    }
  );

  // Fetch category-specific suggestions
  const { data: categorySuggestions, isLoading: isLoadingCategory } = trpc.food.getSuggestionsByCategory.useQuery(
    {
      caloriesRemaining,
      proteinRemaining,
      carbsRemaining,
      fatRemaining,
      category: selectedCategory as any,
      limit: 3,
    },
    {
      enabled: selectedCategory !== "all" && caloriesRemaining > 0,
    }
  );

  const suggestions = selectedCategory === "all" ? generalSuggestions : categorySuggestions;
  const isLoading = selectedCategory === "all" ? isLoadingGeneral : isLoadingCategory;

  if (caloriesRemaining <= 0) {
    return (
      <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-green-600" />
            Daily Goals Met!
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">
            You've reached your daily calorie target. Great job staying on track!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ChefHat className="h-5 w-5 text-blue-600" />
          Meal Suggestions
        </CardTitle>
        <CardDescription>
          {caloriesRemaining > 0
            ? `You have ${Math.round(caloriesRemaining)} calories remaining today`
            : "Daily goals met!"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="all" className="text-xs">
              All
            </TabsTrigger>
            <TabsTrigger value="protein" className="text-xs">
              <Zap className="h-3 w-3" />
            </TabsTrigger>
            <TabsTrigger value="carb" className="text-xs">
              <Wheat className="h-3 w-3" />
            </TabsTrigger>
            <TabsTrigger value="fat" className="text-xs">
              Fat
            </TabsTrigger>
            <TabsTrigger value="balanced" className="text-xs">
              Balanced
            </TabsTrigger>
            <TabsTrigger value="snack" className="text-xs">
              Snack
            </TabsTrigger>
          </TabsList>

          <TabsContent value={selectedCategory} className="space-y-3 mt-4">
            {isLoading ? (
              <div className="text-center py-8">
                <p className="text-sm text-gray-500">Finding perfect meals for you...</p>
              </div>
            ) : suggestions && suggestions.length > 0 ? (
              suggestions.map((suggestion, idx) => (
                <MealSuggestionCard key={idx} suggestion={suggestion} />
              ))
            ) : (
              <div className="text-center py-8">
                <p className="text-sm text-gray-500">No suggestions available for your remaining macros</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

interface MealSuggestionCardProps {
  suggestion: any;
}

function MealSuggestionCard({ suggestion }: MealSuggestionCardProps) {
  const { food, matchScore, macroAlignment, reason } = suggestion;

  // Determine color based on match score
  const getScoreColor = (score: number) => {
    if (score >= 80) return "bg-green-100 text-green-800";
    if (score >= 60) return "bg-blue-100 text-blue-800";
    return "bg-yellow-100 text-yellow-800";
  };

  return (
    <div className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h4 className="font-semibold text-sm">{food.name}</h4>
          <p className="text-xs text-gray-500 mt-1">{food.servingSize}</p>
          <p className="text-xs text-gray-600 mt-2 italic">{reason}</p>
        </div>
        <Badge className={getScoreColor(matchScore)}>{matchScore}% Match</Badge>
      </div>

      <div className="grid grid-cols-4 gap-2 mt-3">
        <MacroDisplay label="Cal" value={food.calories} match={macroAlignment.caloriesMatch} />
        <MacroDisplay label="Pro" value={food.protein} match={macroAlignment.proteinMatch} unit="g" />
        <MacroDisplay label="Carbs" value={food.carbs} match={macroAlignment.carbsMatch} unit="g" />
        <MacroDisplay label="Fat" value={food.fat} match={macroAlignment.fatMatch} unit="g" />
      </div>

      <Button variant="outline" size="sm" className="w-full mt-3">
        Quick Add
      </Button>
    </div>
  );
}

interface MacroDisplayProps {
  label: string;
  value: number;
  match: number;
  unit?: string;
}

function MacroDisplay({ label, value, match, unit = "" }: MacroDisplayProps) {
  const getMatchColor = (m: number) => {
    if (m <= 50) return "text-red-600";
    if (m <= 100) return "text-green-600";
    return "text-orange-600";
  };

  return (
    <div className="text-center">
      <p className="text-xs font-medium text-gray-600">{label}</p>
      <p className="text-sm font-semibold">{value.toFixed(1)}{unit}</p>
      <p className={`text-xs ${getMatchColor(match)}`}>{match}%</p>
    </div>
  );
}
