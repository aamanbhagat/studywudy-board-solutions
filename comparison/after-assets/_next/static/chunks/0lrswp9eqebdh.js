(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([
  "object" == typeof document ? document.currentScript : void 0,
  18566,
  (e, t, r) => {
    t.exports = e.r(76562);
  },
  97453,
  (e) => {
    "use strict";
    var t = e.i(43476),
      r = e.i(71645),
      i = e.i(18566);
    function n({
      ariaLabel: e,
      onChange: i,
      options: s,
      placeholder: a,
      value: l,
    }) {
      return (0, t.jsxs)("select", {
        "aria-label": e,
        className: "course-select",
        onChange: (e) => i(e.target.value),
        style: {
          background: "var(--paper)",
          border: "2px solid var(--ink)",
          borderRadius: "4px",
          boxShadow: "2px 3px 0 var(--ink)",
          color: "var(--ink)",
          cursor: "pointer",
          font: "inherit",
          fontSize: ".69rem",
          fontWeight: 850,
          height: "48px",
          padding: "0 12px",
          width: "100%",
        },
        value: l,
        children: [
          (0, t.jsx)("option", {
            disabled: !0,
            value: "",
            children: a,
          }),
          ...s.map((e) =>
            (0, t.jsx)(
              "option",
              { value: e.value, children: e.label },
              e.value,
            ),
          ),
        ],
      });
    }
    e.s([
      "CourseFinderClient",
      0,
      function ({
        boardName: e,
        boardSlug: s,
        grades: a,
        initialGradeSlug: l,
      }) {
        let o = (0, i.useRouter)(),
          [u, d] = (0, r.useState)(l ?? ""),
          [c, f] = (0, r.useState)(""),
          [p, m] = (0, r.useState)(""),
          [g, h] = (0, r.useState)(""),
          b = a.find((e) => e.slug === u),
          v = !!b?.streams.length,
          j = b?.streams.find((e) => e.slug === c),
          y = j?.courses.find((e) => e.slug === p),
          x = (() => {
            if (!b) return [];
            if (!v) return b.subjects;
            if (!y) return [];
            let e = new Set(y.subjectSlugs);
            return b.subjects.filter((t) => e.has(t.slug));
          })(),
          _ = !!(b && (!v || y)),
          w =
            b && g
              ? v && j && y
                ? `/${s}/${b.slug}/streams/${j.slug}/${y.slug}/${g}`
                : `/${s}/${b.slug}/${g}`
              : "";
        return (0, t.jsxs)("form", {
          className: "course-finder-form",
          onSubmit: function (e) {
            e.preventDefault(), w && o.push(w);
          },
          children: [
            (0, t.jsxs)("div", {
              className: "course-finder-fields",
              children: [
                (0, t.jsxs)("label", {
                  className: "course-finder-field is-locked",
                  children: [
                    (0, t.jsxs)("span", {
                      children: [(0, t.jsx)("b", { children: "01" }), " Board"],
                    }),
                    (0, t.jsx)("input", {
                      "aria-label": "Selected education board",
                      readOnly: !0,
                      value: e,
                    }),
                  ],
                }),
                (0, t.jsxs)("div", {
                  className: "course-finder-field",
                  children: [
                    (0, t.jsxs)("span", {
                      children: [(0, t.jsx)("b", { children: "02" }), " Class"],
                    }),
                    (0, t.jsx)(n, {
                      ariaLabel: "Choose class",
                      onChange: function (e) {
                        d(e), f(""), m(""), h("");
                      },
                      options: a.map((e) => ({
                        value: e.slug,
                        label: `Class ${e.grade}`,
                      })),
                      placeholder: "Choose a class",
                      value: u,
                    }),
                  ],
                }),
                b && v
                  ? (0, t.jsxs)("div", {
                      className: "course-finder-field course-finder-reveal",
                      children: [
                        (0, t.jsxs)("span", {
                          children: [
                            (0, t.jsx)("b", { children: "03" }),
                            " Stream",
                          ],
                        }),
                        (0, t.jsx)(n, {
                          ariaLabel: "Choose stream",
                          onChange: (e) => {
                            f(e), m(""), h("");
                          },
                          options: b.streams.map((e) => ({
                            value: e.slug,
                            label: e.name,
                          })),
                          placeholder: "Choose a stream",
                          value: c,
                        }),
                      ],
                    })
                  : null,
                j
                  ? (0, t.jsxs)("div", {
                      className: "course-finder-field course-finder-reveal",
                      children: [
                        (0, t.jsxs)("span", {
                          children: [
                            (0, t.jsx)("b", { children: "04" }),
                            " Course",
                          ],
                        }),
                        (0, t.jsx)(n, {
                          ariaLabel: "Choose course",
                          onChange: (e) => {
                            m(e), h("");
                          },
                          options: j.courses.map((e) => ({
                            value: e.slug,
                            label: e.name,
                          })),
                          placeholder: "Choose a course",
                          value: p,
                        }),
                      ],
                    })
                  : null,
                _
                  ? (0, t.jsxs)("div", {
                      className:
                        "course-finder-field course-finder-field-subject course-finder-reveal",
                      children: [
                        (0, t.jsxs)("span", {
                          children: [
                            (0, t.jsx)("b", { children: v ? "05" : "03" }),
                            " Subject",
                          ],
                        }),
                        (0, t.jsx)(n, {
                          ariaLabel: "Choose subject",
                          onChange: h,
                          options: x.map((e) => ({
                            value: e.slug,
                            label: e.name,
                          })),
                          placeholder: "Choose a subject",
                          value: g,
                        }),
                      ],
                    })
                  : null,
              ],
            }),
            g
              ? (0, t.jsxs)("div", {
                  className: "course-finder-action course-finder-reveal",
                  children: [
                    (0, t.jsxs)("div", {
                      "aria-live": "polite",
                      children: [
                        (0, t.jsx)("small", {
                          children: "Your selection is ready",
                        }),
                        (0, t.jsx)("strong", {
                          children: x.find((e) => e.slug === g)?.name,
                        }),
                      ],
                    }),
                    (0, t.jsxs)("button", {
                      type: "submit",
                      children: [
                        "Open subject ",
                        (0, t.jsx)("span", {
                          "aria-hidden": "true",
                          children: "→",
                        }),
                      ],
                    }),
                  ],
                })
              : null,
          ],
        });
      },
    ]);
  },
  98879,
  (e, t, r) => {
    "use strict";
    Object.defineProperty(r, "__esModule", { value: !0 }),
      Object.defineProperty(r, "default", {
        enumerable: !0,
        get: function () {
          return l;
        },
      });
    let i = e.r(71645),
      n = "u" < typeof window,
      s = n ? () => {} : i.useLayoutEffect,
      a = n ? () => {} : i.useEffect;
    function l(e) {
      let { headManager: t, reduceComponentsToState: r } = e;
      function l() {
        if (t && t.mountedInstances) {
          let e = i.Children.toArray(
            Array.from(t.mountedInstances).filter(Boolean),
          );
          t.updateHead(r(e));
        }
      }
      return (
        n && (t?.mountedInstances?.add(e.children), l()),
        s(
          () => (
            t?.mountedInstances?.add(e.children),
            () => {
              t?.mountedInstances?.delete(e.children);
            }
          ),
        ),
        s(
          () => (
            t && (t._pendingUpdate = l),
            () => {
              t && (t._pendingUpdate = l);
            }
          ),
        ),
        a(
          () => (
            t &&
              t._pendingUpdate &&
              (t._pendingUpdate(), (t._pendingUpdate = null)),
            () => {
              t &&
                t._pendingUpdate &&
                (t._pendingUpdate(), (t._pendingUpdate = null));
            }
          ),
        ),
        null
      );
    }
  },
  25633,
  (e, t, r) => {
    "use strict";
    Object.defineProperty(r, "__esModule", { value: !0 });
    var i = {
      default: function () {
        return g;
      },
      defaultHead: function () {
        return c;
      },
    };
    for (var n in i) Object.defineProperty(r, n, { enumerable: !0, get: i[n] });
    let s = e.r(55682),
      a = e.r(90809),
      l = e.r(43476),
      o = a._(e.r(71645)),
      u = s._(e.r(98879)),
      d = e.r(42732);
    function c() {
      return [
        (0, l.jsx)("meta", { charSet: "utf-8" }, "charset"),
        (0, l.jsx)(
          "meta",
          { name: "viewport", content: "width=device-width" },
          "viewport",
        ),
      ];
    }
    function f(e, t) {
      return "string" == typeof t || "number" == typeof t
        ? e
        : t.type === o.default.Fragment
          ? e.concat(
              o.default.Children.toArray(t.props.children).reduce(
                (e, t) =>
                  "string" == typeof t || "number" == typeof t
                    ? e
                    : e.concat(t),
                [],
              ),
            )
          : e.concat(t);
    }
    e.r(33525);
    let p = ["name", "httpEquiv", "charSet", "itemProp"];
    function m(e) {
      let t, r, i, n;
      return e
        .reduce(f, [])
        .reverse()
        .concat(c().reverse())
        .filter(
          ((t = new Set()),
          (r = new Set()),
          (i = new Set()),
          (n = {}),
          (e) => {
            let s = !0,
              a = !1;
            if (e.key && "number" != typeof e.key && e.key.indexOf("$") > 0) {
              a = !0;
              let r = e.key.slice(e.key.indexOf("$") + 1);
              t.has(r) ? (s = !1) : t.add(r);
            }
            switch (e.type) {
              case "title":
              case "base":
                r.has(e.type) ? (s = !1) : r.add(e.type);
                break;
              case "meta":
                for (let t = 0, r = p.length; t < r; t++) {
                  let r = p[t];
                  if (e.props.hasOwnProperty(r))
                    if ("charSet" === r) i.has(r) ? (s = !1) : i.add(r);
                    else {
                      let t = e.props[r],
                        i = n[r] || new Set();
                      ("name" !== r || !a) && i.has(t)
                        ? (s = !1)
                        : (i.add(t), (n[r] = i));
                    }
                }
            }
            return s;
          }),
        )
        .reverse()
        .map((e, t) => {
          let r = e.key || t;
          return o.default.cloneElement(e, { key: r });
        });
    }
    let g = function ({ children: e }) {
      let t = (0, o.useContext)(d.HeadManagerContext);
      return (0, l.jsx)(u.default, {
        reduceComponentsToState: m,
        headManager: t,
        children: e,
      });
    };
    ("function" == typeof r.default ||
      ("object" == typeof r.default && null !== r.default)) &&
      void 0 === r.default.__esModule &&
      (Object.defineProperty(r.default, "__esModule", { value: !0 }),
      Object.assign(r.default, r),
      (t.exports = r.default));
  },
  88143,
  (e, t, r) => {
    "use strict";
    function i({
      widthInt: e,
      heightInt: t,
      blurWidth: r,
      blurHeight: n,
      blurDataURL: s,
      objectFit: a,
    }) {
      let l = r ? 40 * r : e,
        o = n ? 40 * n : t,
        u = l && o ? `viewBox='0 0 ${l} ${o}'` : "";
      return `%3Csvg xmlns='http://www.w3.org/2000/svg' ${u}%3E%3Cfilter id='b' color-interpolation-filters='sRGB'%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3CfeColorMatrix values='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 100 -1' result='s'/%3E%3CfeFlood x='0' y='0' width='100%25' height='100%25'/%3E%3CfeComposite operator='out' in='s'/%3E%3CfeComposite in2='SourceGraphic'/%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3C/filter%3E%3Cimage width='100%25' height='100%25' x='0' y='0' preserveAspectRatio='${u ? "none" : "contain" === a ? "xMidYMid" : "cover" === a ? "xMidYMid slice" : "none"}' style='filter: url(%23b);' href='${s}'/%3E%3C/svg%3E`;
    }
    Object.defineProperty(r, "__esModule", { value: !0 }),
      Object.defineProperty(r, "getImageBlurSvg", {
        enumerable: !0,
        get: function () {
          return i;
        },
      });
  },
  87690,
  (e, t, r) => {
    "use strict";
    Object.defineProperty(r, "__esModule", { value: !0 });
    var i = {
      VALID_LOADERS: function () {
        return s;
      },
      imageConfigDefault: function () {
        return a;
      },
    };
    for (var n in i) Object.defineProperty(r, n, { enumerable: !0, get: i[n] });
    let s = ["default", "imgix", "cloudinary", "akamai", "custom"],
      a = {
        deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
        imageSizes: [32, 48, 64, 96, 128, 256, 384],
        path: "/_next/image",
        loader: "default",
        loaderFile: "",
        domains: [],
        disableStaticImages: !1,
        minimumCacheTTL: 14400,
        formats: ["image/webp"],
        maximumDiskCacheSize: void 0,
        maximumRedirects: 3,
        maximumResponseBody: 5e7,
        dangerouslyAllowLocalIP: !1,
        dangerouslyAllowSVG: !1,
        contentSecurityPolicy: "script-src 'none'; frame-src 'none'; sandbox;",
        contentDispositionType: "attachment",
        localPatterns: void 0,
        remotePatterns: [],
        qualities: [75],
        unoptimized: !1,
        customCacheHandler: !1,
      };
  },
  8927,
  (e, t, r) => {
    "use strict";
    Object.defineProperty(r, "__esModule", { value: !0 }),
      Object.defineProperty(r, "getImgProps", {
        enumerable: !0,
        get: function () {
          return u;
        },
      }),
      e.r(33525);
    let i = e.r(43369),
      n = e.r(88143),
      s = e.r(87690),
      a = ["-moz-initial", "fill", "none", "scale-down", void 0];
    function l(e) {
      return void 0 !== e.default;
    }
    function o(e) {
      return void 0 === e
        ? e
        : "number" == typeof e
          ? Number.isFinite(e)
            ? e
            : NaN
          : "string" == typeof e && /^[0-9]+$/.test(e)
            ? parseInt(e, 10)
            : NaN;
    }
    function u(
      {
        src: e,
        sizes: t,
        unoptimized: r = !1,
        priority: d = !1,
        preload: c = !1,
        loading: f,
        className: p,
        quality: m,
        width: g,
        height: h,
        fill: b = !1,
        style: v,
        overrideSrc: j,
        onLoad: y,
        onLoadingComplete: x,
        placeholder: _ = "empty",
        blurDataURL: w,
        fetchPriority: C,
        decoding: S = "async",
        layout: P,
        objectFit: O,
        objectPosition: E,
        lazyBoundary: R,
        lazyRoot: $,
        ...z
      },
      M,
    ) {
      var I;
      let N,
        D,
        T,
        { imgConf: A, showAltText: k, blurComplete: L, defaultLoader: U } = M,
        B = A || s.imageConfigDefault;
      if ("allSizes" in B) N = B;
      else {
        let e = [...B.deviceSizes, ...B.imageSizes].sort((e, t) => e - t),
          t = B.deviceSizes.sort((e, t) => e - t),
          r = B.qualities?.sort((e, t) => e - t);
        N = { ...B, allSizes: e, deviceSizes: t, qualities: r };
      }
      if (void 0 === U)
        throw Object.defineProperty(
          Error(
            "images.loaderFile detected but the file is missing default export.\nRead more: https://nextjs.org/docs/messages/invalid-images-config",
          ),
          "__NEXT_ERROR_CODE",
          { value: "E163", enumerable: !1, configurable: !0 },
        );
      let F = z.loader || U;
      delete z.loader, delete z.srcSet;
      let q = "__next_img_default" in F;
      if (q) {
        if ("custom" === N.loader)
          throw Object.defineProperty(
            Error(`Image with src "${e}" is missing "loader" prop.
Read more: https://nextjs.org/docs/messages/next-image-missing-loader`),
            "__NEXT_ERROR_CODE",
            { value: "E252", enumerable: !1, configurable: !0 },
          );
      } else {
        let e = F;
        F = (t) => {
          let { config: r, ...i } = t;
          return e(i);
        };
      }
      if (P) {
        "fill" === P && (b = !0);
        let e = {
          intrinsic: { maxWidth: "100%", height: "auto" },
          responsive: { width: "100%", height: "auto" },
        }[P];
        e && (v = { ...v, ...e });
        let r = { responsive: "100vw", fill: "100vw" }[P];
        r && !t && (t = r);
      }
      let W = "",
        G = o(g),
        X = o(h);
      if ((I = e) && "object" == typeof I && (l(I) || void 0 !== I.src)) {
        let t = l(e) ? e.default : e;
        if (!t.src)
          throw Object.defineProperty(
            Error(
              `An object should only be passed to the image component src parameter if it comes from a static image import. It must include src. Received ${JSON.stringify(t)}`,
            ),
            "__NEXT_ERROR_CODE",
            { value: "E460", enumerable: !1, configurable: !0 },
          );
        if (!t.height || !t.width)
          throw Object.defineProperty(
            Error(
              `An object should only be passed to the image component src parameter if it comes from a static image import. It must include height and width. Received ${JSON.stringify(t)}`,
            ),
            "__NEXT_ERROR_CODE",
            { value: "E48", enumerable: !1, configurable: !0 },
          );
        if (
          ((D = t.blurWidth),
          (T = t.blurHeight),
          (w = w || t.blurDataURL),
          (W = t.src),
          !b)
        )
          if (G || X) {
            if (G && !X) {
              let e = G / t.width;
              X = Math.round(t.height * e);
            } else if (!G && X) {
              let e = X / t.height;
              G = Math.round(t.width * e);
            }
          } else (G = t.width), (X = t.height);
      }
      let H = !d && !c && ("lazy" === f || void 0 === f);
      (!(e = "string" == typeof e ? e : W) ||
        e.startsWith("data:") ||
        e.startsWith("blob:")) &&
        ((r = !0), (H = !1)),
        N.unoptimized && (r = !0),
        q &&
          !N.dangerouslyAllowSVG &&
          e.split("?", 1)[0].endsWith(".svg") &&
          (r = !0);
      let V = o(m),
        Y = Object.assign(
          b
            ? {
                position: "absolute",
                height: "100%",
                width: "100%",
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
                objectFit: O,
                objectPosition: E,
              }
            : {},
          k ? {} : { color: "transparent" },
          v,
        ),
        J =
          L || "empty" === _
            ? null
            : "blur" === _
              ? `url("data:image/svg+xml;charset=utf-8,${(0, n.getImageBlurSvg)({ widthInt: G, heightInt: X, blurWidth: D, blurHeight: T, blurDataURL: w || "", objectFit: Y.objectFit })}")`
              : `url("${_}")`,
        K = a.includes(Y.objectFit)
          ? "fill" === Y.objectFit
            ? "100% 100%"
            : "cover"
          : Y.objectFit,
        Q = J
          ? {
              backgroundSize: K,
              backgroundPosition: Y.objectPosition || "50% 50%",
              backgroundRepeat: "no-repeat",
              backgroundImage: J,
            }
          : {},
        Z = (function ({
          config: e,
          src: t,
          unoptimized: r,
          width: n,
          quality: s,
          sizes: a,
          loader: l,
        }) {
          if (r) {
            if (t.startsWith("/") && !t.startsWith("//")) {
              let e = (0, i.getDeploymentId)();
              if (e) {
                let r = t.indexOf("?");
                if (-1 !== r) {
                  let i = new URLSearchParams(t.slice(r + 1));
                  i.get("dpl") ||
                    (i.append("dpl", e),
                    (t = t.slice(0, r) + "?" + i.toString()));
                } else t += `?dpl=${e}`;
              }
            }
            return { src: t, srcSet: void 0, sizes: void 0 };
          }
          let { widths: o, kind: u } = (function (
              { deviceSizes: e, allSizes: t },
              r,
              i,
            ) {
              if (i) {
                let r = /(^|\s)(1?\d?\d)vw/g,
                  n = [];
                for (let e; (e = r.exec(i)); ) n.push(parseInt(e[2]));
                if (n.length) {
                  let r = 0.01 * Math.min(...n);
                  return { widths: t.filter((t) => t >= e[0] * r), kind: "w" };
                }
                return { widths: t, kind: "w" };
              }
              return "number" != typeof r
                ? { widths: e, kind: "w" }
                : {
                    widths: [
                      ...new Set(
                        [r, 2 * r].map(
                          (e) => t.find((t) => t >= e) || t[t.length - 1],
                        ),
                      ),
                    ],
                    kind: "x",
                  };
            })(e, n, a),
            d = o.length - 1;
          return {
            sizes: a || "w" !== u ? a : "100vw",
            srcSet: o
              .map(
                (r, i) =>
                  `${l({ config: e, src: t, quality: s, width: r })} ${"w" === u ? r : i + 1}${u}`,
              )
              .join(", "),
            src: l({ config: e, src: t, quality: s, width: o[d] }),
          };
        })({
          config: N,
          src: e,
          unoptimized: r,
          width: G,
          quality: V,
          sizes: t,
          loader: F,
        }),
        ee = H ? "lazy" : f;
      return {
        props: {
          ...z,
          loading: ee,
          fetchPriority: C,
          width: G,
          height: X,
          decoding: S,
          className: p,
          style: { ...Y, ...Q },
          sizes: Z.sizes,
          srcSet: Z.srcSet,
          src: j || Z.src,
        },
        meta: { unoptimized: r, preload: c || d, placeholder: _, fill: b },
      };
    }
  },
  18556,
  (e, t, r) => {
    "use strict";
    Object.defineProperty(r, "__esModule", { value: !0 }),
      Object.defineProperty(r, "ImageConfigContext", {
        enumerable: !0,
        get: function () {
          return s;
        },
      });
    let i = e.r(55682)._(e.r(71645)),
      n = e.r(87690),
      s = i.default.createContext(n.imageConfigDefault);
  },
  65856,
  (e, t, r) => {
    "use strict";
    Object.defineProperty(r, "__esModule", { value: !0 }),
      Object.defineProperty(r, "RouterContext", {
        enumerable: !0,
        get: function () {
          return i;
        },
      });
    let i = e.r(55682)._(e.r(71645)).default.createContext(null);
  },
  18815,
  (e, t, r) => {
    "use strict";
    function i(e, t) {
      let r = e || 75;
      return t?.qualities?.length
        ? t.qualities.reduce(
            (e, t) => (Math.abs(t - r) < Math.abs(e - r) ? t : e),
            t.qualities[0],
          )
        : r;
    }
    Object.defineProperty(r, "__esModule", { value: !0 }),
      Object.defineProperty(r, "findClosestQuality", {
        enumerable: !0,
        get: function () {
          return i;
        },
      });
  },
  1948,
  (e, t, r) => {
    "use strict";
    Object.defineProperty(r, "__esModule", { value: !0 }),
      Object.defineProperty(r, "default", {
        enumerable: !0,
        get: function () {
          return a;
        },
      });
    let i = e.r(18815),
      n = e.r(43369);
    function s({ config: e, src: t, width: r, quality: a }) {
      let l = (0, n.getDeploymentId)();
      if (t.startsWith("/") && !t.startsWith("//")) {
        let e = t.indexOf("?");
        if (-1 !== e) {
          let r = new URLSearchParams(t.slice(e + 1)),
            i = r.get("dpl");
          if (i) {
            (l = i), r.delete("dpl");
            let n = r.toString();
            t = t.slice(0, e) + (n ? "?" + n : "");
          }
        }
      }
      if (
        t.startsWith("/") &&
        t.includes("?") &&
        e.localPatterns?.length === 1 &&
        "**" === e.localPatterns[0].pathname &&
        "" === e.localPatterns[0].search
      )
        throw Object.defineProperty(
          Error(`Image with src "${t}" is using a query string which is not configured in images.localPatterns.
Read more: https://nextjs.org/docs/messages/next-image-unconfigured-localpatterns`),
          "__NEXT_ERROR_CODE",
          { value: "E871", enumerable: !1, configurable: !0 },
        );
      let o = (0, i.findClosestQuality)(a, e);
      return `${e.path}?url=${encodeURIComponent(t)}&w=${r}&q=${o}${t.startsWith("/") && l ? `&dpl=${l}` : ""}`;
    }
    s.__next_img_default = !0;
    let a = s;
  },
  5500,
  (e, t, r) => {
    "use strict";
    Object.defineProperty(r, "__esModule", { value: !0 }),
      Object.defineProperty(r, "Image", {
        enumerable: !0,
        get: function () {
          return y;
        },
      });
    let i = e.r(55682),
      n = e.r(90809),
      s = e.r(43476),
      a = n._(e.r(71645)),
      l = i._(e.r(74080)),
      o = i._(e.r(25633)),
      u = e.r(8927),
      d = e.r(87690),
      c = e.r(18556);
    e.r(33525);
    let f = e.r(65856),
      p = i._(e.r(1948)),
      m = e.r(18581),
      g = {
        deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
        imageSizes: [32, 48, 64, 96, 128, 256, 384],
        qualities: [75],
        path: "/_next/image",
        loader: "default",
        dangerouslyAllowSVG: !1,
        unoptimized: !1,
      };
    function h(e, t, r, i, n, s, a) {
      let l = e?.src;
      e &&
        e["data-loaded-src"] !== l &&
        ((e["data-loaded-src"] = l),
        ("decode" in e ? e.decode() : Promise.resolve())
          .catch(() => {})
          .then(() => {
            if (e.parentElement && e.isConnected) {
              if (("empty" !== t && n(!0), r?.current)) {
                let t = new Event("load");
                Object.defineProperty(t, "target", { writable: !1, value: e });
                let i = !1,
                  n = !1;
                r.current({
                  ...t,
                  nativeEvent: t,
                  currentTarget: e,
                  target: e,
                  isDefaultPrevented: () => i,
                  isPropagationStopped: () => n,
                  persist: () => {},
                  preventDefault: () => {
                    (i = !0), t.preventDefault();
                  },
                  stopPropagation: () => {
                    (n = !0), t.stopPropagation();
                  },
                });
              }
              i?.current && i.current(e);
            }
          }));
    }
    function b(e) {
      return a.use ? { fetchPriority: e } : { fetchpriority: e };
    }
    "u" < typeof window && (globalThis.__NEXT_IMAGE_IMPORTED = !0);
    let v = (0, a.forwardRef)(
      (
        {
          src: e,
          srcSet: t,
          sizes: r,
          height: i,
          width: n,
          decoding: l,
          className: o,
          style: u,
          fetchPriority: d,
          placeholder: c,
          loading: f,
          unoptimized: p,
          fill: g,
          onLoadRef: v,
          onLoadingCompleteRef: j,
          setBlurComplete: y,
          setShowAltText: x,
          sizesInput: _,
          onLoad: w,
          onError: C,
          ...S
        },
        P,
      ) => {
        let O = (0, a.useCallback)(
            (e) => {
              e && (C && (e.src = e.src), e.complete && h(e, c, v, j, y, p, _));
            },
            [e, c, v, j, y, C, p, _],
          ),
          E = (0, m.useMergedRef)(P, O);
        return (0, s.jsx)("img", {
          ...S,
          ...b(d),
          loading: f,
          width: n,
          height: i,
          decoding: l,
          "data-nimg": g ? "fill" : "1",
          className: o,
          style: u,
          sizes: r,
          srcSet: t,
          src: e,
          ref: E,
          onLoad: (e) => {
            h(e.currentTarget, c, v, j, y, p, _);
          },
          onError: (e) => {
            x(!0), "empty" !== c && y(!0), C && C(e);
          },
        });
      },
    );
    function j({ isAppRouter: e, imgAttributes: t }) {
      let r = {
        as: "image",
        imageSrcSet: t.srcSet,
        imageSizes: t.sizes,
        crossOrigin: t.crossOrigin,
        referrerPolicy: t.referrerPolicy,
        ...b(t.fetchPriority),
      };
      return e && l.default.preload
        ? (l.default.preload(t.src, r), null)
        : (0, s.jsx)(o.default, {
            children: (0, s.jsx)(
              "link",
              { rel: "preload", href: t.srcSet ? void 0 : t.src, ...r },
              "__nimg-" + t.src + t.srcSet + t.sizes,
            ),
          });
    }
    let y = (0, a.forwardRef)((e, t) => {
      let r = (0, a.useContext)(f.RouterContext),
        i = (0, a.useContext)(c.ImageConfigContext),
        n = (0, a.useMemo)(() => {
          let e = g || i || d.imageConfigDefault,
            t = [...e.deviceSizes, ...e.imageSizes].sort((e, t) => e - t),
            r = e.deviceSizes.sort((e, t) => e - t),
            n = e.qualities?.sort((e, t) => e - t);
          return {
            ...e,
            allSizes: t,
            deviceSizes: r,
            qualities: n,
            localPatterns:
              "u" < typeof window ? i?.localPatterns : e.localPatterns,
          };
        }, [i]),
        { onLoad: l, onLoadingComplete: o } = e,
        m = (0, a.useRef)(l);
      (0, a.useEffect)(() => {
        m.current = l;
      }, [l]);
      let h = (0, a.useRef)(o);
      (0, a.useEffect)(() => {
        h.current = o;
      }, [o]);
      let [b, y] = (0, a.useState)(!1),
        [x, _] = (0, a.useState)(!1),
        { props: w, meta: C } = (0, u.getImgProps)(e, {
          defaultLoader: p.default,
          imgConf: n,
          blurComplete: b,
          showAltText: x,
        });
      return (0, s.jsxs)(s.Fragment, {
        children: [
          (0, s.jsx)(v, {
            ...w,
            unoptimized: C.unoptimized,
            placeholder: C.placeholder,
            fill: C.fill,
            onLoadRef: m,
            onLoadingCompleteRef: h,
            setBlurComplete: y,
            setShowAltText: _,
            sizesInput: e.sizes,
            ref: t,
          }),
          C.preload
            ? (0, s.jsx)(j, { isAppRouter: !r, imgAttributes: w })
            : null,
        ],
      });
    });
    ("function" == typeof r.default ||
      ("object" == typeof r.default && null !== r.default)) &&
      void 0 === r.default.__esModule &&
      (Object.defineProperty(r.default, "__esModule", { value: !0 }),
      Object.assign(r.default, r),
      (t.exports = r.default));
  },
]);
