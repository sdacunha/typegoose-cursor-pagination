import * as bsonUrlEncoding from "./utils/bsonUrlEncoding";
import { IPaginateOptions, SortOptions } from "./types";
import { Expression, PipelineStage } from "mongoose";
import merge from 'lodash/merge';


export const normalizeSortOptions = (sortOptions: SortOptions[]): SortOptions[] => {
  const fields = Object.keys(sortOptions || []);
  let newOptions: SortOptions[] = sortOptions;
  if (!sortOptions) {
    newOptions = [];
    newOptions.push({ '_id': 1 });
  } else if (fields.includes('_id')) {
    // Ensure id is at the end
    const newSortFields = sortOptions.filter((field) => !field._id);
    const _idSort = sortOptions.find((field) => !!field._id);
    newSortFields.push(_idSort);
    newOptions = newSortFields;
  } else {
    newOptions.push({ '_id': 1 });
  }
  return newOptions;
};

const getSortComparer = (isPrevious: boolean, number: number): "$gt" | "$lt" => {
  if (number === 1 || number === -1 && isPrevious) {
    return "$gt";
  }
  if (number === -1 || number === 1 && isPrevious) {
    return "$lt";
  }
  throw new Error("Invalid sort number");
}

const getSortDirection = (isPrevious: boolean, number: number): 1 | -1 => {
  if (number === 1 || number === -1 && isPrevious) {
    return 1;
  }
  if (number === -1 || number === 1 && isPrevious) {
    return -1;
  }
  throw new Error("Invalid sort number");
}

/**
 * Generate a query object for the next/previous page
 * @param options The pagination options
 */
export function generateCursorQuery(options: IPaginateOptions) {
  // Return an empty query upon no cursor string
  const query: any = {};
  if (!options.next && !options.previous) {
    return query;
  }

  // Decode cursor string
  const decoded = bsonUrlEncoding.decode(options.previous || options.next);
  const sortByField = options.sortOptions.reduce((acc, field) => ({
    ...acc,
    [Object.keys(field)[0]]: Object.values(field)[0],
  }), {});

  const isOnlyIdSort = options.sortOptions.length === 1 && !!options.sortOptions[0]._id;

  const firstCondition: Record<string, unknown> = merge(
    Object.keys(options.sortOptions.slice(0, -1))
          .map((field, index) => ({ 
            [field]: { [getSortComparer(!!options.previous, sortByField[field])]: decoded[index] } })
          ));

  const secondCondition = merge([
    ...Object.keys(options.sortOptions.slice(0, -1)).map((field, index) => ({ [field]: decoded[index] })), 
    { _id: { [getSortComparer(!!options.previous, sortByField._id)]: decoded[decoded.length - 1] } }
  ]);
  
  if (!isOnlyIdSort) {
    query.$or = [
      firstCondition,
      secondCondition,
    ];
  } else {
    query._id = { [getSortComparer(!!options.previous, sortByField._id)]: decoded[0] };
  }
  return query;
}

/**
 * Generate a sort object to sort the find() in the correct order
 * @param options The pagination options
 */
export function generateSort(options: IPaginateOptions): Record<string, 1 | -1 | Expression.Meta> {
  // We need to normalize where _id is, and the existence of _id
  const isOnlyIdSort = options.sortOptions.length === 1 && !!options.sortOptions[0]._id;

  // Secondary sort on _id
  if (!isOnlyIdSort) {
    return {
      ...options.sortOptions.reduce((acc, field) => ({
        ...acc,
        [Object.keys(field)[0]]: getSortDirection(!!options.previous, Object.values(field)[0]),
      }), {}),
    }
  } else {
    return {
      _id: getSortDirection(!!options.previous, options.sortOptions[0]._id),
    };
  }
}
