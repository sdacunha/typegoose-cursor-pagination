import * as bsonUrlEncoding from "./utils/bsonUrlEncoding";
import { IPaginateOptions, SortOptions } from "./types";
import { Expression, PipelineStage } from "mongoose";
import merge from 'lodash/merge';


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
  const query: any = {};
  if (!options.next && !options.previous) {
    return query;
  }

  // Decode cursor string
  const decoded = bsonUrlEncoding.decode(options.previous || options.next);
  const isOnlyIdSort = Object.keys(options.sortOptions).length === 1 && !!options.sortOptions._id;
  const keysExceptId = Object.keys(options.sortOptions).filter((field) => field !== '_id');

  const firstCondition: Record<string, -1 | 1> = keysExceptId.reduce((acc, field, index) => ({
      ...acc,
      [field]: { [getSortComparer(!!options.previous, options.sortOptions[field])]: decoded[index] },
    }), {});

  const secondValues: Record<string, -1 | 1> = keysExceptId.reduce((acc, field, index) => ({
      ...acc,
      [field]: decoded[index],
    }), {});

  const secondCondition = {
    ...secondValues, 
    _id: { [getSortComparer(!!options.previous, options.sortOptions._id)]: decoded[decoded.length - 1] },
  };
  
  if (!isOnlyIdSort) {
    query.$or = [
      firstCondition,
      secondCondition,
    ];
  } else {
    query._id = { [getSortComparer(!!options.previous, options.sortOptions._id)]: decoded[0] };
  }
  return query;
}

/**
 * Generate a sort object to sort the find() in the correct order
 * @param options The pagination options
 */
export function generateSort(options: IPaginateOptions): Record<string, 1 | -1 | Expression.Meta> {
  // We need to normalize where _id is, and the existence of _id
  const isOnlyIdSort = Object.keys(options.sortOptions).length === 1 && !!options.sortOptions._id;

  // Secondary sort on _id
  if (!isOnlyIdSort) {
    return {
      ...options.sortOptions
    }
  } else {
    return {
      _id: getSortDirection(!!options.previous, options.sortOptions._id),
    };
  }
}
