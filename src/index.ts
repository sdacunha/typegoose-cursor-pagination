import { Schema, PopulateOptions, Aggregate, PipelineStage, Expression } from "mongoose";
import { generateCursorQuery, normalizeSortOptions } from "./query";
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
    const sort = normalizeSortOptions(options.sortOptions);

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
    pipeline?: Aggregate<T[]>,
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
    const userPipeline = pipeline.pipeline();
    const sortPipelines =
        userPipeline.filter((item) => Object.keys(item).includes("$sort"));

    const hasSort = sortPipelines.length > 0;

    const existingSorts = sortPipelines.map((item) => (item as PipelineStage.Sort)?.$sort).reduce((acc, item) => ({ ...acc, ...item }), {});

    options.sortOptions = hasSort ? existingSorts : normalizeSortOptions(options.sortOptions);
    if (!options.sortOptions._id) {
      throw Error('sort must include _id');
    }
    options.limit = useDefaultLimit ? defaultLimit : options.limit;

    const sort = options.sortOptions;
    const match = generateCursorQuery(options);
    const shouldSkip = Object.keys(match).length > 0;

    let totalDocs = undefined;
    let docs: T[] = [];

    // Append the sort to the pipeline if it doesn't already exist
    const hasProjectsWithoutId = userPipeline
      .filter((item) => Object.keys(item).includes("$project"))
      .filter((item) => (item as PipelineStage.Project)?.$project?._id === 0);
    if (hasProjectsWithoutId.length) {
      throw new Error("Pipeline has $project that exclude _id, aggregatePaged requires _id");
    }
    const newPipeline: Aggregate<
    {
      results: T[];
      totalCount: [{ count: number }];
    }[] | T[]> = this.aggregate();

    newPipeline.append(...userPipeline.filter((item) => !Object.keys(item).includes("$sort")));
    if (!dontCountDocs) {
      const hasProjectsWithoutId = userPipeline
        .filter((item) => Object.keys(item).includes("$project"))
        .filter((item) => (item as PipelineStage.Project)?.$project?._id === 0);
      if (hasProjectsWithoutId.length) {
        throw new Error(
          "Pipeline has $project that exclude _id, aggregatePaged requires _id"
        );
      }

      newPipeline.facet({
        results: [
          ...(shouldSkip ? [{ $match: match }] : []),
          { $sort: sort },
          ...(unlimited ? [] : [{ $limit: options.limit + 1 }]),
        ],
        totalCount: [
          {
            $count: "count",
          },
        ],
      });
      const totalDocsAggregate = await newPipeline.exec() as { results: T[]; totalCount: [{ count: number }] }[];
      const [result] = totalDocsAggregate || [];
      const { results, totalCount } = result || {
        results: [],
        totalCount: [{ count: 0 }],
      };
      const countResult = totalCount || [{ count: 0 }];
      docs = results;
      totalDocs = countResult[0]?.count || 0;
    } else {
      if (shouldSkip) {
        newPipeline.match(match);
      }
      
      newPipeline.sort(sort);
    
      if (!unlimited) {
        newPipeline.limit(options.limit + 1);
      }
      docs = await newPipeline.exec() as T[];
    }
    return prepareResponse<T>(docs, options, totalDocs);
  }

  schema.statics.findPaged = findPaged;
  schema.statics.aggregatePaged = aggregatePaged;
}

export * from "./types";
