import * as bsonUrlEncoding from "./utils/bsonUrlEncoding";
import { IPaginateOptions, SortOptions } from "./types";
import { Expression } from "mongoose";

export const normalizeSortOptions = (sortOptions: SortOptions): SortOptions => {
  const fields = Object.keys(sortOptions || []);
  let newOptions: SortOptions = sortOptions;
 if (fields.includes('_id')) {
    // Ensure id is at the end
    const keysExceptId = fields.filter((field) => field !== '_id');
    let newSortFields = keysExceptId.reduce((acc, field) => ({ 
      ...acc,
      [field]: sortOptions[field],
    }), {});
    newSortFields = { ...newSortFields, _id: sortOptions._id };
    newOptions = newSortFields;
  } else if (fields.length > 0) {
    // If no _id, add it
     newOptions = { ...newOptions, _id: 1 };
  } else {
    newOptions = { _id: 1 };
  }
  return newOptions;
};

const getSortComparer = (isPrevious: boolean, val: -1 | 1 | Expression.Meta): "$gt" | "$lt" => {
  if (val === 1 || val === -1) {
    if (val === 1 || val === -1 && isPrevious) {
      return "$gt";
    }
    if (val === -1 || val === 1 && isPrevious) {
      return "$lt";
    }
  }
  // textScore, sort desc
  return "$lt";
}

const generateEqualQuery = (isPrevious: boolean, index: number, key: string, fields: Record<string, 1 | -1 | Expression.Meta>, decoded: any[]) => {
  const keysEqual = Object.keys(fields).slice(0, index);

  // Here, we check if the fields previous to the field we are checking is equal
  const equalQuery = keysEqual.reduce((acc, field, index) => {
    const val = fields[field];
    return {
      ...acc,
      [field]: decoded[index]
    }
  }, {});

  // Now, we ensure that the sort order is maintained by verifying the fields below it
  const checkQuery = {
    [key]: { [getSortComparer(isPrevious, fields[key])]: decoded[index] },
  }

  return {
    ...equalQuery,
    ...checkQuery,
  }
}

const getSortDirection = (isPrevious: boolean, val: -1 | 1 | Expression.Meta): 1 | -1 => {
  if (val === 1 || val === -1) {
    if (val === 1 || val === -1 && isPrevious) {
      return 1;
    }
    if (val === -1 || val === 1 && isPrevious) {
      return -1;
    }
  }
  // textScore, sort desc
  return -1;
}

export function generateCursorQuery(options: IPaginateOptions) {
  // Return an empty query upon no cursor string
  if (!options.next && !options.previous) {
    return {};
  }

  // Decode cursor string
  const decoded = bsonUrlEncoding.decode(options.previous || options.next);
  const keys = Object.keys(options.sortOptions);

  // Generate the query for the case that the first n are equal, but the next satisfies the sort condition
  const query = keys.map((key, index) => {
    return generateEqualQuery(!!options.previous, index, key, options.sortOptions, decoded);
  });
  
  /**
   * 
   */
  return { $or: query };
}