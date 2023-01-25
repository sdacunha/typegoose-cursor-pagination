import { Aggregate, Expression, Model, Query } from "mongoose";
import { DocumentType } from "@typegoose/typegoose";


export type SortOptions = Record<string, 1 | -1 | Expression.Meta>;

/**
 * The pagination options that can be passed.
 */
export interface IPaginateOptions {
  limit?: number;
  sortOptions?: SortOptions;
  next?: string;
  previous?: string;
}

/**
 * The result of the paginated find request
 */
export interface IPaginateResult<T> {
  hasNext?: boolean;
  hasPrevious?: boolean;
  next?: string;
  previous?: string;
  totalDocs: number;
  docs: T[];
}

/**
 * An extension of the mongoose Model which include the findPaged method.
 */
export interface IPaginateModel<T> extends Model<DocumentType<T>, {}> {
  findPaged<R = T>(
    options: IPaginateOptions,
    query?: Object,
    projection?: Object,
    _populate?: (Object | string)[]
  ): Query<IPaginateResult<DocumentType<R>>, DocumentType<R>>;
  aggregatePaged<R = T>(
    options: IPaginateOptions,
    _pipeline?: Aggregate<R[]>,
    _options?: Record<string, unknown>
  ): Query<IPaginateResult<DocumentType<R>>, DocumentType<R>>;
}

/**
 * [Typegoose only] This is a type that you can cast your Typegoose model to
 * Example: export const UserModel = new User().getModelForClass(User) as PaginateModel<User, typeof User>;
 */
export type PaginateModel<T, T2> = IPaginateModel<DocumentType<T>> & T & T2;
