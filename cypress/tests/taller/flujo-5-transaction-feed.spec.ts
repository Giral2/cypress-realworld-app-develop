describe("Flujo 5: Historial y Feed de Transacciones", () => {
  const backendUrl = "http://localhost:3001";

  beforeEach(() => {
    cy.task("db:seed");
    cy.viewport(1280, 720);

    cy.intercept("GET", "/transactions/public*").as("publicTransactions");
    cy.intercept("GET", "/transactions*").as("personalTransactions");

    cy.login("Katharina_Bernier", "s3cret");
  });

  it("TC-FEED-001 (Caja Negra - Filtro de Rango Válido): Filtrado de transacciones entre $200 y $400", () => {
    cy.intercept("GET", "/transactions/public*amountMin*").as("filteredPublicTransactions");

    cy.visit("/");
    cy.getBySel("nav-public-tab").click();

    // Ajustar filtro entre $200 y $400
    cy.setTransactionAmountRange(200, 400);

    cy.getBySelLike("filter-amount-range-text").should("contain", "$200 - $400");

    cy.wait("@filteredPublicTransactions").then(({ response }: any) => {
      const results = response.body.results;
      const url = response.url;
      const urlParams = new URLSearchParams(url.split("?")[1]);
      expect(urlParams.get("amountMin")).to.equal("20000");
      expect(urlParams.get("amountMax")).to.equal("40000");

      if (results && results.length > 0) {
        results.forEach((item: any) => {
          expect(item.amount).to.be.within(20000, 40000);
        });
      }
    });

    cy.screenshot("evidencias/flujo-5-transaction-feed/TC-FEED-001");
  });

  it("TC-FEED-002 (Caja Negra - Estado Vacío Empty State): Visualización del componente vacío ante rango sin registros", () => {
    cy.intercept("GET", "/transactions*", {
      statusCode: 200,
      body: {
        pageData: { page: 1, limit: 10, hasNextPages: false, totalPages: 0 },
        results: [],
      },
    }).as("emptyPersonalTransactions");

    cy.visit("/");
    cy.getBySel("nav-personal-tab").click();
    cy.wait("@emptyPersonalTransactions");

    cy.getBySelLike("transaction-item").should("have.length", 0);
    cy.getBySel("empty-list-header")
      .should("be.visible")
      .and("contain", "No Transactions");

    cy.screenshot("evidencias/flujo-5-transaction-feed/TC-FEED-002");
  });

  it("TC-FEED-003 (Caja Negra - Reset de Filtros): Restauración de la lista completa al reiniciar filtros", () => {
    cy.visit("/");
    cy.getBySel("nav-public-tab").click();
    cy.wait("@publicTransactions").its("response.body.results").as("initialResults");

    // Aplicar filtro de monto
    cy.setTransactionAmountRange(200, 400);
    cy.wait("@publicTransactions");

    // Presionar el botón de Reset / Clear
    cy.getBySel("transaction-list-filter-amount-clear-button").click();
    cy.get(".MuiBackdrop-root").click({ force: true });

    cy.get("@initialResults").then((initialResults: any) => {
      cy.wait("@publicTransactions")
        .its("response.body.results")
        .should("have.length", initialResults.length);
    });

    cy.screenshot("evidencias/flujo-5-transaction-feed/TC-FEED-003");
  });

  it("TC-FEED-CB-001 (Caja Blanca - Rama hasAmountFilter === true): Inclusión de parámetros amountMin y amountMax en la consulta", () => {
    cy.intercept("GET", "/transactions/public*amountMin*").as("filteredPublicTransactions");

    cy.visit("/");
    cy.getBySel("nav-public-tab").click();

    cy.setTransactionAmountRange(150, 350);

    cy.wait("@filteredPublicTransactions").then(({ response }: any) => {
      const url = response.url;
      const urlParams = new URLSearchParams(url.split("?")[1]);
      expect(urlParams.get("amountMin")).to.equal("15000");
      expect(urlParams.get("amountMax")).to.equal("35000");
    });

    cy.screenshot("evidencias/flujo-5-transaction-feed/TC-FEED-CB-001");
  });

  it("TC-FEED-CB-002 (Caja Blanca - Rama hasAmountFilter === false): Consulta de transacciones por defecto sin parámetros de monto", () => {
    cy.visit("/");
    cy.getBySel("nav-public-tab").click();

    cy.wait("@publicTransactions").then(({ response }: any) => {
      const url = response.url;
      const urlParams = new URLSearchParams(url.split("?")[1] || "");
      expect(urlParams.has("amountMin")).to.be.false;
      expect(urlParams.has("amountMax")).to.be.false;
    });

    cy.getBySel("transaction-list").should("be.visible");
    cy.screenshot("evidencias/flujo-5-transaction-feed/TC-FEED-CB-002");
  });

  it("TC-EXP-FEED-001 (Experiencia - Sanitización XSS): Renderizado seguro como texto plano de inyecciones HTML/JS", () => {
    const xssPayload = '<b style="color:red">PruebaXSS</b>';

    // Crear transacción con descripción conteniendo payload XSS
    cy.database("find", "users", { username: "Heath93" }).then((receiver: any) => {
      cy.request({
        method: "POST",
        url: `${backendUrl}/transactions`,
        body: {
          transactionType: "payment",
          amount: 12,
          description: xssPayload,
          receiverId: receiver.id,
          privacyLevel: "public",
        },
      });
    });

    cy.visit("/");
    cy.getBySel("nav-public-tab").click();
    cy.wait("@publicTransactions");

    // Verificar que la etiqueta se muestra como texto plano escapado
    cy.getBySel("transaction-list").should("contain", xssPayload);
    // Verificar que NO se inyectó un elemento DOM <b> con estilo color rojo
    cy.get('b[style*="color:red"]').should("not.exist");

    cy.screenshot("evidencias/flujo-5-transaction-feed/TC-EXP-FEED-001");
  });

  it("TC-EXP-FEED-002 (Experiencia - Estrés de Scroll Infinito): Carga progresiva y estabilidad ante scroll continuo veloz", () => {
    cy.visit("/");
    cy.getBySel("nav-public-tab").click();
    cy.wait("@publicTransactions");

    cy.getBySel("transaction-list").should("be.visible");

    // Realizar scroll reiterado hacia abajo simulando interacción rápida
    for (let i = 0; i < 5; i++) {
      cy.scrollTo("bottom", { duration: 250, ensureScrollable: false });
      cy.wait(200);
    }

    // La lista se mantiene estable y renderiza items progresivamente
    cy.getBySelLike("transaction-item").should("have.length.greaterThan", 0);
    cy.getBySel("transaction-list").should("be.visible");

    cy.screenshot("evidencias/flujo-5-transaction-feed/TC-EXP-FEED-002");
  });
});
