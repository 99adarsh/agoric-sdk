import makeDefaultEvaluateOptions from '@agoric/default-evaluate-options';

// The evaluate maker, which curries the makerOptions.
export const makeEvaluators = (makerOptions = {}) => {
  // Evaluate any shims, globally!
  // eslint-disable-next-line no-eval
  (makerOptions.shims || []).forEach(shim => (1, eval)(shim));

  let evaluateProgram;
  const makeEvaluator = defaultSourceType => (
    source,
    endowments = {},
    options = {},
  ) => {
    const { transforms: optionsTransforms, ...optionsRest } = options;
    const {
      transforms: makerTransforms,
      endowments: makerEndowments,
      ...makerRest
    } = makerOptions;
    const fullTransforms = [
      ...(optionsTransforms || []),
      ...(makerTransforms || []),
    ];
    const fullEndowments = Object.create(null, {
      ...Object.getOwnPropertyDescriptors(makerEndowments || {}),
      ...Object.getOwnPropertyDescriptors(endowments),
    });

    const sourceType =
      options.sourceType || makerOptions.sourceType || defaultSourceType;
    const staticOptions = {
      ...makerRest,
      ...optionsRest,
      endowments: fullEndowments,
      evaluateProgram,
      sourceType,
    };
    const endowmentState = fullTransforms.reduce(
      (es, transform) => (transform.endow ? transform.endow(es) : es),
      staticOptions,
    );

    const sourceState = fullTransforms.reduce(
      (ss, transform) => (transform.rewrite ? transform.rewrite(ss) : ss),
      { ...staticOptions, src: source },
    );

    // Work around Babel appending semicolons.
    // TODO: This belongs only in the individual transforms.
    const maybeSource = sourceState.src;
    const actualSource =
      sourceType === 'expression' &&
      maybeSource.endsWith(';') &&
      !source.endsWith(';')
        ? maybeSource.slice(0, -1)
        : maybeSource;

    // Generate the expression context, if necessary.
    const src =
      sourceType === 'expression' ? `(${actualSource}\n)` : actualSource;

    // This function's first argument is the endowments.
    // The second argument is the source string to evaluate.
    // It is in strict mode so that `this` is undefined.
    //
    // The eval below is direct, so that we have access to the named endowments.
    const scopedEval = `(function() {
      with (arguments[0]) {
        return function() {
          'use strict';
          return eval(arguments[0]);
        };
      }
    })`;

    // The eval below is indirect, so that we are only in the global scope.
    // eslint-disable-next-line no-eval
    return (1, eval)(scopedEval)(endowmentState.endowments)(src);
  };

  // We need to make this first so that it is available to the other evaluators.
  evaluateProgram = makeEvaluator('program');
  return {
    evaluateProgram,
    evaluateExpr: makeEvaluator('expression'),
    evaluateModule: makeEvaluator('module'),
  };
};

// Export the default evaluators.
export const defaultEvaluateOptions = makeDefaultEvaluateOptions();
export const { evaluateExpr, evaluateProgram, evaluateModule } = makeEvaluators(
  defaultEvaluateOptions,
);
export default evaluateExpr;
