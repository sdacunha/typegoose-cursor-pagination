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
    _pipeline?: Aggregate<T[]>,
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
    const dontCountDocs = pluginOptions && pluginOptions.dontReturnTotalDocs;
    const match = generateCursorQuery(options);
    const shouldSkip = Object.keys(match).length > 0;
    const limit = unlimited ? 0 : options.limit + 1;
    const sort = generateSort(options);
    options.limit = useDefaultLimit ? defaultLimit : options.limit;

    let totalDocs = undefined;
    let docs: T[] = [];
    if (!dontCountDocs) {
      // We need to execute queries separately since theres no way
      // to tell what is projected in the pipeline stages
      // Get documents
      const newPipeline: Aggregate<T[]> = this.aggregate();
      newPipeline.sort(sort);
      if (shouldSkip) {
        newPipeline.match(match);
      }
      newPipeline.append(_pipeline.pipeline());
      newPipeline.limit(limit);
      const totalDocsAggregate = await newPipeline.exec();

      // Count
      const countPipeline: Aggregate<[{ count: number }]> = this.aggregate();
      countPipeline.append(_pipeline.pipeline());
      countPipeline.count("count");
      const [countResult] = await countPipeline.exec();

      docs = totalDocsAggregate;
      totalDocs = countResult.count;
    } else {
      const newPipeline: Aggregate<T[]> = this.aggregate();
      newPipeline.sort(sort);
      newPipeline.append(_pipeline.pipeline());
      if (shouldSkip) {
        newPipeline.match(match);
      }
      newPipeline.limit(limit);
      docs = await newPipeline.exec();
    }

    return prepareResponse<T>(docs, options, totalDocs);
  }

  schema.statics.findPaged = findPaged;
  schema.statics.aggregatePaged = aggregatePaged;
}

export * from "./types";
