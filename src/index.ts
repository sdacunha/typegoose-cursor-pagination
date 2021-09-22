import { Schema, PopulateOptions, Aggregate } from "mongoose";
import { generateCursorQuery, generateSort } from "./query";
import { prepareResponse } from "./response";
import { IPaginateOptions, IPaginateResult } from "./types";

export interface IPluginOptions {
  dontReturnTotalDocs?: boolean;
  dontAllowUnlimitedResults?: boolean;
  defaultLimit?: number;
}

/**
 * A mongoose plugin to perform paginated find() requests.
 * @param schema the schema for the plugin
 */
export default function (schema: Schema, pluginOptions?: IPluginOptions) {
  /**
   * Peform a paginated find() request
   * @param {IPaginateOptions} options the pagination options
   * @param {Object} [_query] the mongo query
   * @param {Object} [_projection] the mongo projection
   * @param {ModelPopulateOptions | ModelPopulateOptions[]} [_populate] the mongo populate
   */
  async function findPaged<T>(
    options: IPaginateOptions,
    _query?: Object,
    _projection?: Object,
    _populate?: PopulateOptions | PopulateOptions[]
  ): Promise<IPaginateResult<T>> {
    // Determine sort
    const sort = generateSort(options);

    // Determine limit
    const defaultLimit =
      pluginOptions && pluginOptions.defaultLimit
        ? pluginOptions.defaultLimit
        : 10;
    const useDefaultLimit =
      isNaN(options.limit) ||
      options.limit < 0 ||
      (options.limit === 0 &&
        pluginOptions &&
        pluginOptions.dontAllowUnlimitedResults);
    const unlimited =
      options.limit === 0 &&
      (!pluginOptions || !pluginOptions.dontAllowUnlimitedResults);
    options.limit = useDefaultLimit ? defaultLimit : options.limit;

    // Query documents
    const query = { $and: [generateCursorQuery(options), _query || {}] };

    // Request one extra result to check for a next/previous
    const docs = await this.find(query, _projection)
      .sort(sort)
      .limit(unlimited ? 0 : options.limit + 1)
      .populate(_populate || []);

    if (pluginOptions && pluginOptions.dontReturnTotalDocs) {
      return prepareResponse<T>(docs, options);
    } else {
      const totalDocs = await this.countDocuments(_query).exec();
      return prepareResponse<T>(docs, options, totalDocs);
    }
  }

  /**
   * Peform a paginated aggregate() request
   * @param {IPaginateOptions} options the pagination options
   * @param {Object} [_pipeline] the mongo aggregate pipeline
   * @param {Object} [_options] the mongo aggregate options
   */
  async function aggregatePaged<T>(
    options: IPaginateOptions,
    _pipeline?: any[],
    _options?: Record<string, unknown>
  ): Promise<IPaginateResult<T>> {
    // Determine limit
    const defaultLimit =
      pluginOptions && pluginOptions.defaultLimit
        ? pluginOptions.defaultLimit
        : 10;
    const useDefaultLimit =
      isNaN(options.limit) ||
      options.limit < 0 ||
      (options.limit === 0 &&
        pluginOptions &&
        pluginOptions.dontAllowUnlimitedResults);
    const unlimited =
      options.limit === 0 &&
      (!pluginOptions || !pluginOptions.dontAllowUnlimitedResults);
    options.limit = useDefaultLimit ? defaultLimit : options.limit;

    const sort = { $sort: generateSort(options) };
    const query = { $match: generateCursorQuery(options) };
    const limit = { $limit: unlimited ? 0 : options.limit + 1 };

    // Request one extra result to check for a next/previous
    const docs: T[] = await this.aggregate(
      [sort, query, ..._pipeline, limit],
      _options
    ).exec();

    if (pluginOptions && pluginOptions.dontReturnTotalDocs) {
      return prepareResponse<T>(docs, options);
    } else {
      const aggregateCountPipeline = [
        ..._pipeline,
        {
          $count: "totalDocs",
        },
      ];
      const totalDocsAggregate: { totalDocs: number } = await this.aggregate(
        aggregateCountPipeline
      ).exec();
      return prepareResponse<T>(docs, options, totalDocsAggregate.totalDocs);
    }
  }

  schema.statics.findPaged = findPaged;
  schema.statics.aggregatePaged = aggregatePaged;
}

export * from "./types";
