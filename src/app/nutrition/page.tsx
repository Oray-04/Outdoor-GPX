import { NutritionPlanner } from "@/components/nutrition/planner";

export const metadata = { title: "Planificateur nutritionnel — course, trail, ultra", description: "Glucides, hydratation, sodium et caféine calculés pour votre course, puis répartis prise par prise avec vos produits. Fiche PDF imprimable." };

export default function Page() { return <NutritionPlanner />; }
