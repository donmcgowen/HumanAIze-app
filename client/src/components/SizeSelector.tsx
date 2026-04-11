import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

interface SizeMacros {
  small: { calories: number; protein: number; carbs: number; fat: number };
  medium: { calories: number; protein: number; carbs: number; fat: number };
  large: { calories: number; protein: number; carbs: number; fat: number };
}

interface SizeSelectorProps {
  foodName: string;
  sizeMacros: SizeMacros;
  onSizeChange: (size: "small" | "medium" | "large", macros: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }) => void;
}

export function SizeSelector({
  foodName,
  sizeMacros,
  onSizeChange,
}: SizeSelectorProps) {
  const [selectedSize, setSelectedSize] = useState<"small" | "medium" | "large">("medium");

  useEffect(() => {
    onSizeChange(selectedSize, sizeMacros[selectedSize]);
  }, [selectedSize, sizeMacros, onSizeChange]);

  const sizes: Array<"small" | "medium" | "large"> = ["small", "medium", "large"];

  const getMacrosForSize = (size: "small" | "medium" | "large") => {
    return sizeMacros[size];
  };

  const getWeightEstimate = (size: "small" | "medium" | "large"): string => {
    const estimates: Record<string, Record<string, string>> = {
      apple: { small: "~150g", medium: "~182g", large: "~223g" },
      banana: { small: "~101g", medium: "~118g", large: "~136g" },
      orange: { small: "~96g", medium: "~131g", large: "~184g" },
      strawberry: { small: "~12g", medium: "~15g", large: "~18g" },
    };

    const fruitName = foodName.toLowerCase();
    return estimates[fruitName]?.[size] || "~medium";
  };

  return (
    <div className="space-y-4 p-4 rounded-lg bg-slate-900/50 border border-white/10">
      <div>
        <h3 className="font-semibold text-white mb-2">{foodName}</h3>
        <p className="text-sm text-slate-400 mb-4">Select size to see nutrition info</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {sizes.map((size) => {
          const macros = getMacrosForSize(size);
          const isSelected = selectedSize === size;
          const weight = getWeightEstimate(size);

          return (
            <Button
              key={size}
              onClick={() => setSelectedSize(size)}
              variant={isSelected ? "default" : "outline"}
              className={`flex flex-col items-center justify-center h-auto py-3 px-2 ${
                isSelected
                  ? "bg-cyan-500 hover:bg-cyan-600 text-white"
                  : "border-white/10 text-slate-300 hover:text-white"
              }`}
            >
              <span className="capitalize font-semibold text-sm">{size}</span>
              <span className="text-xs text-slate-400 mt-1">{weight}</span>
              <span className="text-xs font-semibold mt-2">{macros.calories.toFixed(0)} cal</span>
            </Button>
          );
        })}
      </div>

      <div className="grid grid-cols-4 gap-2 pt-3 border-t border-white/10">
        <div>
          <p className="text-xs text-slate-400">Calories</p>
          <p className="font-semibold text-cyan-400">
            {getMacrosForSize(selectedSize).calories.toFixed(0)}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Protein</p>
          <p className="font-semibold text-blue-400">
            {getMacrosForSize(selectedSize).protein.toFixed(1)}g
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Carbs</p>
          <p className="font-semibold text-amber-400">
            {getMacrosForSize(selectedSize).carbs.toFixed(1)}g
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Fat</p>
          <p className="font-semibold text-orange-400">
            {getMacrosForSize(selectedSize).fat.toFixed(1)}g
          </p>
        </div>
      </div>

      <div className="text-xs text-slate-500 pt-2">
        <p>💡 Sizes are approximate. Actual nutrition may vary by variety and ripeness.</p>
      </div>
    </div>
  );
}
