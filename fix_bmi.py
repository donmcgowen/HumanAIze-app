import re

with open('client/src/pages/Profile.tsx', 'r') as f:
    content = f.read()

# Fix the BMI calculation to use correct formula based on units
old_bmi_calc = '''  // Calculate BMI whenever height or weight changes
  useEffect(() => {
    const height = parseFloat(formData.heightCm);
    const weight = parseFloat(formData.weightKg);

    if (height > 0 && weight > 0) {
      const heightM = height / 100;
      const calculatedBmi = weight / (heightM * heightM);
      setBmi(Math.round(calculatedBmi * 10) / 10);'''

new_bmi_calc = '''  // Calculate BMI whenever height or weight changes
  useEffect(() => {
    const heightInput = parseFloat(formData.heightCm);
    const weightInput = parseFloat(formData.weightKg);

    if (heightInput > 0 && weightInput > 0) {
      let calculatedBmi: number;
      
      if (heightUnit === "in" && weightUnit === "lbs") {
        // Imperial formula: BMI = (weight_lbs / (height_inches²)) × 703
        calculatedBmi = (weightInput / (heightInput * heightInput)) * 703;
      } else if (heightUnit === "cm" && weightUnit === "kg") {
        // Metric formula: BMI = weight_kg / (height_m²)
        const heightM = heightInput / 100;
        calculatedBmi = weightInput / (heightM * heightM);
      } else {
        // Mixed units - convert to metric first
        let heightCm = heightUnit === "in" ? heightInput * 2.54 : heightInput;
        let weightKg = weightUnit === "lbs" ? weightInput / 2.20462 : weightInput;
        const heightM = heightCm / 100;
        calculatedBmi = weightKg / (heightM * heightM);
      }
      
      setBmi(Math.round(calculatedBmi * 10) / 10);'''

content = content.replace(old_bmi_calc, new_bmi_calc)

# Replace the switch buttons with dropdowns
old_buttons = '''                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setWeightUnit(weightUnit === "kg" ? "lbs" : "kg")}
                    className="px-3 py-1 text-xs font-semibold rounded-md bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-cyan-400/30"
                  >
                    {weightUnit === "kg" ? "Switch to lbs" : "Switch to kg"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setHeightUnit(heightUnit === "cm" ? "in" : "cm")}
                    className="px-3 py-1 text-xs font-semibold rounded-md bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-cyan-400/30"
                  >
                    {heightUnit === "cm" ? "Switch to in" : "Switch to cm"}
                  </button>
                </div>'''

new_buttons = ''

content = content.replace(old_buttons, new_buttons)

# Add unit selectors next to height and weight inputs
old_height_section = '''                <div>
                  <Label htmlFor="heightCm" className="text-slate-300">
                    Height ({heightUnit})
                  </Label>
                  <div className="flex gap-2 mt-2">
                    <Input
                      id="heightCm"
                      name="heightCm"
                      type="number"
                      placeholder={heightUnit === "cm" ? "170" : "67"}
                      value={formData.heightCm}
                      onChange={handleInputChange}
                      className="bg-slate-900 border-white/10 text-white placeholder-slate-500"
                    />
                    <div className="flex items-center px-3 py-2 rounded-md bg-slate-900 border border-white/10 text-slate-400 text-sm">
                      {displayHeight()} {heightUnit}
                    </div>
                  </div>
                </div>'''

new_height_section = '''                <div>
                  <Label htmlFor="heightCm" className="text-slate-300">
                    Height
                  </Label>
                  <div className="flex gap-2 mt-2">
                    <Input
                      id="heightCm"
                      name="heightCm"
                      type="number"
                      placeholder={heightUnit === "cm" ? "170" : "67"}
                      value={formData.heightCm}
                      onChange={handleInputChange}
                      className="bg-slate-900 border-white/10 text-white placeholder-slate-500"
                    />
                    <Select value={heightUnit} onValueChange={(value) => setHeightUnit(value as "cm" | "in")}>
                      <SelectTrigger className="w-20 bg-slate-900 border-white/10 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cm">cm</SelectItem>
                        <SelectItem value="in">in</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center px-3 py-2 rounded-md bg-slate-900 border border-white/10 text-slate-400 text-sm">
                      {displayHeight()} {heightUnit}
                    </div>
                  </div>
                </div>'''

content = content.replace(old_height_section, new_height_section)

# Add unit selector for weight
old_weight_section = '''                <div>
                  <Label htmlFor="weightKg" className="text-slate-300">
                    Weight ({weightUnit})
                  </Label>
                  <div className="flex gap-2 mt-2">
                    <Input
                      id="weightKg"
                      name="weightKg"
                      type="number"
                      placeholder={weightUnit === "kg" ? "70" : "154"}
                      value={formData.weightKg}
                      onChange={handleInputChange}
                      className="bg-slate-900 border-white/10 text-white placeholder-slate-500"
                    />
                    <div className="flex items-center px-3 py-2 rounded-md bg-slate-900 border border-white/10 text-slate-400 text-sm">
                      {displayWeight()} {weightUnit}
                    </div>
                  </div>
                </div>'''

new_weight_section = '''                <div>
                  <Label htmlFor="weightKg" className="text-slate-300">
                    Weight
                  </Label>
                  <div className="flex gap-2 mt-2">
                    <Input
                      id="weightKg"
                      name="weightKg"
                      type="number"
                      placeholder={weightUnit === "kg" ? "70" : "154"}
                      value={formData.weightKg}
                      onChange={handleInputChange}
                      className="bg-slate-900 border-white/10 text-white placeholder-slate-500"
                    />
                    <Select value={weightUnit} onValueChange={(value) => setWeightUnit(value as "kg" | "lbs")}>
                      <SelectTrigger className="w-20 bg-slate-900 border-white/10 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kg">kg</SelectItem>
                        <SelectItem value="lbs">lbs</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center px-3 py-2 rounded-md bg-slate-900 border border-white/10 text-slate-400 text-sm">
                      {displayWeight()} {weightUnit}
                    </div>
                  </div>
                </div>'''

content = content.replace(old_weight_section, new_weight_section)

# Update the useEffect dependency to include unit changes
old_dependency = '''  }, [formData.heightCm, formData.weightKg]);'''
new_dependency = '''  }, [formData.heightCm, formData.weightKg, heightUnit, weightUnit]);'''

content = content.replace(old_dependency, new_dependency)

with open('client/src/pages/Profile.tsx', 'w') as f:
    f.write(content)

print("✓ Fixed BMI calculation and replaced buttons with dropdowns")
