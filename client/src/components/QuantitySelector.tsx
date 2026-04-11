import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Minus, Plus } from "lucide-react";

interface QuantitySelectorProps {
  foodName: string;
  unit: string; // "egg", "piece", "slice", etc.
  macrosPerUnit: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  onQuantityChange: (quantity: number, totalMacros: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }) => void;
}

export function QuantitySelector({
  foodName,
  unit,
  macrosPerUnit,
  onQuantityChange,
}: QuantitySelectorProps) {
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    const totalMacros = {
      calories: macrosPerUnit.calories * quantity,
      protein: macrosPerUnit.protein * quantity,
      carbs: macrosPerUnit.carbs * quantity,
      fat: macrosPerUnit.fat * quantity,
    };
    onQuantityChange(quantity, totalMacros);
  }, [quantity, macrosPerUnit, onQuantityChange]);

  const handleDecrement = () => {
    if (quantity > 1) {
      setQuantity(quantity - 1);
    }
  };

  const handleIncrement = () => {
    setQuantity(quantity + 1);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value > 0) {
      setQuantity(value);
    }
  };

  const totalCalories = macrosPerUnit.calories * quantity;
  const totalProtein = macrosPerUnit.protein * quantity;
  const totalCarbs = macrosPerUnit.carbs * quantity;
  const totalFat = macrosPerUnit.fat * quantity;

  return (
    <div className="space-y-4 p-4 rounded-lg bg-slate-900/50 border border-white/10">
      <div>
        <h3 className="font-semibold text-white mb-2">
          {foodName}
        </h3>
        <p className="text-sm text-slate-400 mb-3">
          Per {unit}: {macrosPerUnit.calories.toFixed(0)} cal | {macrosPerUnit.protein.toFixed(1)}g protein
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={handleDecrement}
          disabled={quantity <= 1}
          className="h-8 w-8 p-0"
        >
          <Minus className="h-4 w-4" />
        </Button>

        <Input
          type="number"
          min="1"
          value={quantity}
          onChange={handleInputChange}
          className="w-16 text-center h-8"
        />

        <span className="text-sm text-slate-400">{unit}(s)</span>

        <Button
          variant="outline"
          size="sm"
          onClick={handleIncrement}
          className="h-8 w-8 p-0"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-2 pt-3 border-t border-white/10">
        <div>
          <p className="text-xs text-slate-400">Calories</p>
          <p className="font-semibold text-cyan-400">{totalCalories.toFixed(0)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Protein</p>
          <p className="font-semibold text-blue-400">{totalProtein.toFixed(1)}g</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Carbs</p>
          <p className="font-semibold text-amber-400">{totalCarbs.toFixed(1)}g</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Fat</p>
          <p className="font-semibold text-orange-400">{totalFat.toFixed(1)}g</p>
        </div>
      </div>
    </div>
  );
}
