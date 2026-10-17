// Generateur de RECETTE de craft Bedrock (shaped / shapeless), dans le behavior pack.
import { Recipe, Project } from '../../types.js';

export interface RecipeGenResult {
  json: Record<string, unknown>;
  warnings: string[];
}

export function generateRecipeJson(recipe: Recipe, _project: Project): RecipeGenResult {
  const warnings: string[] = [];
  const tags = ['crafting_table'];

  if (recipe.type === 'shaped') {
    const grid = recipe.grid ?? [[], [], []];
    // on compacte la grille en lignes de pattern + table de cle->item
    const keyOf = new Map<string, string>();
    const letters = 'ABCDEFGHI'.split('');
    let li = 0;
    const pattern: string[] = [];
    for (let r = 0; r < 3; r++) {
      let row = '';
      for (let c = 0; c < 3; c++) {
        const cell = (grid[r] && grid[r][c]) || '';
        if (!cell) { row += ' '; continue; }
        if (!keyOf.has(cell)) { keyOf.set(cell, letters[li++]); }
        row += keyOf.get(cell);
      }
      pattern.push(row);
    }
    const key: Record<string, { item: string }> = {};
    for (const [item, letter] of keyOf) key[letter] = { item };
    if (keyOf.size === 0) warnings.push('Recette vide : aucun ingredient dans la grille.');

    return {
      json: {
        format_version: _project.formatVersion,
        'minecraft:recipe_shaped': {
          description: { identifier: recipe.identifier },
          tags,
          unlock: { context: 'AlwaysUnlocked' },
          pattern,
          key,
          result: { item: recipe.resultItem, count: recipe.resultCount },
        },
      },
      warnings,
    };
  }

  // shapeless
  const ingredients = (recipe.ingredients ?? []).filter(Boolean).map((item) => ({ item }));
  if (ingredients.length === 0) warnings.push('Recette sans forme vide : aucun ingredient.');
  return {
    json: {
      format_version: _project.formatVersion,
      'minecraft:recipe_shapeless': {
        description: { identifier: recipe.identifier },
        tags,
        unlock: { context: 'AlwaysUnlocked' },
        ingredients,
        result: { item: recipe.resultItem, count: recipe.resultCount },
      },
    },
    warnings,
  };
}
