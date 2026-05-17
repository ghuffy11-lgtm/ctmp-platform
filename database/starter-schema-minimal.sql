
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL
);

CREATE TABLE tenders (
    id UUID PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    status VARCHAR(50),
    created_at TIMESTAMP NOT NULL
);

CREATE TABLE vendors (
    id UUID PRIMARY KEY,
    company_name VARCHAR(255),
    created_at TIMESTAMP NOT NULL
);

CREATE TABLE bids (
    id UUID PRIMARY KEY,
    tender_id UUID REFERENCES tenders(id),
    vendor_id UUID REFERENCES vendors(id),
    created_at TIMESTAMP NOT NULL
);
