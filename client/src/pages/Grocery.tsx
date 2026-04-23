import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ShoppingCart,
  Sparkles,
  Plus,
  Trash2,
  CheckSquare,
  Square,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  X,
  Loader2,
  Beef,
  Milk,
  Apple,
  Wheat,
  Droplets,
  Coffee,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── Category config ───────────────────────────────────────────────────────────
const CATEGORIES: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  protein:   { label: "Protein",    icon: Beef,     color: "text-red-400" },
  dairy:     { label: "Dairy",      icon: Milk,     color: "text-blue-300" },
  produce:   { label: "Produce",    icon: Apple,    color: "text-green-400" },
  grains:    { label: "Grains",     icon: Wheat,    color: "text-yellow-400" },
  fats:      { label: "Fats & Oils",icon: Droplets, color: "text-orange-400" },
  beverages: { label: "Beverages",  icon: Coffee,   color: "text-cyan-400" },
  other:     { label: "Other",      icon: Package,  color: "text-slate-400" },
};

const CATEGORY_ORDER = ["protein", "dairy", "produce", "grains", "fats", "beverages", "other"];

type GroceryItem = {
  id: number;
  name: string;
  category: string;
  caloriesPer100g: number | null;
  proteinPer100g: number | null;
  carbsPer100g: number | null;
  fatPer100g: number | null;
  suggestedQty: string | null;
  notes: string | null;
  isChecked: number;
  isAiSuggested: number;
};

export function Grocery() {
  const utils = trpc.useUtils();
  const { data: items = [], isLoading } = trpc.grocery.getItems.useQuery();
  const generateMutation = trpc.grocery.generateWithAI.useMutation({
    onSuccess: () => {
      utils.grocery.getItems.invalidate();
      toast.success("Grocery list generated! Tailored to your macro targets.");
    },
    onError: (e) => toast.error(e.message || "Failed to generate list"),
  });
  const toggleMutation = trpc.grocery.toggleChecked.useMutation({
    onMutate: async ({ id, isChecked }) => {
      await utils.grocery.getItems.cancel();
      const prev = utils.grocery.getItems.getData();
      utils.grocery.getItems.setData(undefined, (old) =>
        old?.map((item) => item.id === id ? { ...item, isChecked: isChecked ? 1 : 0 } : item)
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) utils.grocery.getItems.setData(undefined, ctx.prev);
    },
  });
  const deleteMutation = trpc.grocery.deleteItem.useMutation({
    onSuccess: () => utils.grocery.getItems.invalidate(),
    onError: (e) => toast.error(e.message),
  });
  const clearCheckedMutation = trpc.grocery.clearChecked.useMutation({
    onSuccess: () => {
      utils.grocery.getItems.invalidate();
      toast.success("Checked items removed");
    },
  });
  const addItemMutation = trpc.grocery.addItem.useMutation({
    onSuccess: () => {
      utils.grocery.getItems.invalidate();
      setShowAddDialog(false);
      setNewItem({ name: "", category: "other", suggestedQty: "", notes: "" });
      toast.success("Item added");
    },
    onError: (e) => toast.error(e.message),
  });

  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", category: "other", suggestedQty: "", notes: "" });
  const [searchQuery, setSearchQuery] = useState("");

  // Group items by category
  const grouped = useMemo(() => {
    const filtered = searchQuery
      ? items.filter((i) => i.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : items;

    const groups: Record<string, GroceryItem[]> = {};
    for (const cat of CATEGORY_ORDER) groups[cat] = [];
    for (const item of filtered) {
      const cat = CATEGORY_ORDER.includes(item.category) ? item.category : "other";
      groups[cat].push(item as GroceryItem);
    }
    return groups;
  }, [items, searchQuery]);

  const checkedCount = items.filter((i) => i.isChecked).length;
  const totalCount = items.length;

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-16">
      {/* ── Header ── */}
      <div className="border-b border-white/10 bg-card/60 px-4 py-5 md:px-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <ShoppingCart className="h-6 w-6 text-cyan-400" />
            <div>
              <h1 className="text-xl font-black uppercase tracking-[0.12em] text-white">Grocery List</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                {totalCount === 0
                  ? "Generate a personalized list based on your macro targets"
                  : `${checkedCount} of ${totalCount} items checked`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {checkedCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="border-white/20 text-slate-300 hover:text-white hover:bg-white/10"
                onClick={() => clearCheckedMutation.mutate()}
                disabled={clearCheckedMutation.isPending}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Clear Checked ({checkedCount})
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="border-white/20 text-slate-300 hover:text-white hover:bg-white/10"
              onClick={() => setShowAddDialog(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Item
            </Button>
            <Button
              size="sm"
              className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold"
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              )}
              {items.length > 0 ? "Regenerate with AI" : "Generate with AI"}
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        {totalCount > 0 && (
          <div className="mt-4">
            <div className="h-1.5 w-full rounded-full bg-white/10">
              <div
                className="h-1.5 rounded-full bg-cyan-400 transition-all duration-500"
                style={{ width: `${(checkedCount / totalCount) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Search */}
        {totalCount > 0 && (
          <div className="mt-3 relative">
            <Input
              placeholder="Search items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-white/5 border-white/15 text-white placeholder:text-slate-500 h-9 text-sm"
            />
            {searchQuery && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                onClick={() => setSearchQuery("")}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="px-4 py-4 md:px-6 space-y-3">
        {isLoading && (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading grocery list...
          </div>
        )}

        {!isLoading && totalCount === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ShoppingCart className="h-16 w-16 text-slate-700 mb-4" />
            <h2 className="text-lg font-bold text-white mb-2">No grocery list yet</h2>
            <p className="text-sm text-slate-400 max-w-sm mb-6">
              Click <strong className="text-cyan-400">Generate with AI</strong> to get a personalized grocery list
              based on your daily macro targets and fitness goal. Gemini will suggest the best whole foods
              to help you hit your protein, carb, and fat targets every day.
            </p>
            <Button
              className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold"
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              {generateMutation.isPending ? "Generating your list..." : "Generate with AI"}
            </Button>
          </div>
        )}

        {generateMutation.isPending && totalCount === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
            <p className="text-sm">Gemini is building your personalized grocery list...</p>
            <p className="text-xs text-slate-500">This takes about 10 seconds</p>
          </div>
        )}

        {/* Category groups */}
        {!isLoading && CATEGORY_ORDER.map((cat) => {
          const catItems = grouped[cat] ?? [];
          if (catItems.length === 0) return null;
          const catConfig = CATEGORIES[cat];
          const Icon = catConfig.icon;
          const isCollapsed = collapsedCategories.has(cat);
          const checkedInCat = catItems.filter((i) => i.isChecked).length;

          return (
            <div key={cat} className="border border-white/10 bg-card/40 rounded-none overflow-hidden">
              {/* Category header */}
              <button
                className="flex w-full items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
                onClick={() => toggleCategory(cat)}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`h-4 w-4 ${catConfig.color}`} />
                  <span className="text-sm font-semibold uppercase tracking-[0.08em] text-white">
                    {catConfig.label}
                  </span>
                  <span className="text-xs text-slate-500">
                    {checkedInCat}/{catItems.length}
                  </span>
                </div>
                {isCollapsed
                  ? <ChevronRight className="h-4 w-4 text-slate-500" />
                  : <ChevronDown className="h-4 w-4 text-slate-500" />
                }
              </button>

              {/* Items */}
              {!isCollapsed && (
                <div className="divide-y divide-white/5">
                  {catItems.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                        item.isChecked ? "opacity-50" : ""
                      }`}
                    >
                      {/* Checkbox */}
                      <button
                        className="mt-0.5 flex-shrink-0 text-slate-400 hover:text-cyan-400 transition-colors"
                        onClick={() => toggleMutation.mutate({ id: item.id, isChecked: !item.isChecked })}
                      >
                        {item.isChecked
                          ? <CheckSquare className="h-5 w-5 text-cyan-400" />
                          : <Square className="h-5 w-5" />
                        }
                      </button>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm font-medium ${item.isChecked ? "line-through text-slate-500" : "text-white"}`}>
                            {item.name}
                          </span>
                          {item.isAiSuggested ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/20 font-medium">
                              AI
                            </span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-slate-500 border border-white/10 font-medium">
                              Manual
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          {item.suggestedQty && (
                            <span className="text-xs text-cyan-300 font-medium">{item.suggestedQty}</span>
                          )}
                          {(item.proteinPer100g ?? 0) > 0 && (
                            <span className="text-xs text-slate-500">
                              {Math.round(item.proteinPer100g ?? 0)}g P · {Math.round(item.carbsPer100g ?? 0)}g C · {Math.round(item.fatPer100g ?? 0)}g F per 100g
                            </span>
                          )}
                        </div>
                        {item.notes && (
                          <p className="text-xs text-slate-500 mt-0.5 italic">{item.notes}</p>
                        )}
                      </div>

                      {/* Delete */}
                      <button
                        className="flex-shrink-0 text-slate-600 hover:text-red-400 transition-colors mt-0.5"
                        onClick={() => {
                          if (confirm(`Remove "${item.name}" from your list?`)) {
                            deleteMutation.mutate({ id: item.id });
                          }
                        }}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Macro summary card */}
        {!isLoading && totalCount > 0 && (
          <div className="border border-white/10 bg-card/40 rounded-none p-4 mt-2">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-cyan-400" />
              <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-300">
                AI Grocery Insight
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              This list was generated based on your daily macro targets and fitness goal. Each category is
              chosen to support your nutrition plan — high-protein items for muscle support, complex carbs
              for sustained energy, and healthy fats for hormonal balance. Regenerate anytime your goals change.
            </p>
          </div>
        )}
      </div>

      {/* ── Add Item Dialog ── */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-slate-900 border-white/15 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white font-bold uppercase tracking-[0.1em]">Add Grocery Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-[0.08em] mb-1 block">Item Name</label>
              <Input
                placeholder="e.g. Chicken Breast"
                value={newItem.name}
                onChange={(e) => setNewItem((p) => ({ ...p, name: e.target.value }))}
                className="bg-white/5 border-white/15 text-white placeholder:text-slate-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-[0.08em] mb-1 block">Category</label>
              <Select value={newItem.category} onValueChange={(v) => setNewItem((p) => ({ ...p, category: v }))}>
                <SelectTrigger className="bg-white/5 border-white/15 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-white/15 text-white">
                  {CATEGORY_ORDER.map((cat) => (
                    <SelectItem key={cat} value={cat} className="text-white hover:bg-white/10 focus:bg-white/10">
                      {CATEGORIES[cat].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-[0.08em] mb-1 block">Quantity (optional)</label>
              <Input
                placeholder="e.g. 2 lbs, 1 dozen"
                value={newItem.suggestedQty}
                onChange={(e) => setNewItem((p) => ({ ...p, suggestedQty: e.target.value }))}
                className="bg-white/5 border-white/15 text-white placeholder:text-slate-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-[0.08em] mb-1 block">Notes (optional)</label>
              <Input
                placeholder="e.g. buy organic, low sodium"
                value={newItem.notes}
                onChange={(e) => setNewItem((p) => ({ ...p, notes: e.target.value }))}
                className="bg-white/5 border-white/15 text-white placeholder:text-slate-500"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="border-white/20 text-slate-300 hover:text-white"
              onClick={() => setShowAddDialog(false)}
            >
              Cancel
            </Button>
            <Button
              className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold"
              disabled={!newItem.name.trim() || addItemMutation.isPending}
              onClick={() => addItemMutation.mutate({
                name: newItem.name.trim(),
                category: newItem.category,
                suggestedQty: newItem.suggestedQty || undefined,
                notes: newItem.notes || undefined,
              })}
            >
              {addItemMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
