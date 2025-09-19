# 🌐 AetherNet: A Full-Stack Solana DePIN Project

AetherNet is a complete decentralized physical infrastructure network (DePIN) project built on the **Solana** blockchain. It showcases a full-stack, scalable architecture combining an **Anchor (Rust) smart contract**, a high-performance **Rust indexer and REST API**, and a modern **Next.js** frontend.

This repository serves as a comprehensive template for developers looking to build and deploy robust, real-world dApps on Solana.

🔗 **Live Demo:** [**AetherNet-DePin**](https://aethernet-depin.vercel.app/)

---

## 📸 Demo

![AetherNet dApp Screenshot](./docs/screenshot.png)

---

## ✨ Features

* **On-Chain Node Registry:** Users can register and deregister their physical devices on the Solana blockchain.
* **SPL Token Staking:** Node registration requires staking a specific SPL token, which is returned upon deregistration.
* **High-Performance Indexer:** A background service built in Rust (`sqlx`, `tokio`) listens to on-chain accounts and syncs their state to a PostgreSQL database in near real-time.
* **REST API:** A scalable REST API built with Rust and **Axum** serves the indexed on-chain data to any client.
* **Reactive Frontend:** A modern dApp built with **Next.js**, TypeScript, and Tailwind CSS provides a seamless user interface for wallet connection, node management, and viewing network stats.
* **Full User Lifecycle:** Complete flow for users to register, view their registered node, and deregister.
* **Scalable by Design:** The architecture separates on-chain logic from off-chain data querying, ensuring the UI remains fast and responsive, regardless of how many nodes are on the network.

---

## 🏗️ Architecture

The project is structured into four main components that work together to deliver a seamless experience. The indexer acts as a critical off-chain layer, allowing the frontend to load data instantly without making expensive RPC calls for all users.

```mermaid
graph LR
    subgraph "Off-Chain Services"
        A[🌐 Frontend dApp <br>(Next.js)] --> B{🚀 REST API <br>(Rust/Axum)};
        B --> E[(🐘 PostgreSQL <br>Database)];
        C[🔄 Indexer <br>(Rust/SQLx)] --> E;
    end

    subgraph "On-Chain"
         D[⛓️ Solana Program <br>(Anchor/Rust)];
    end
    
    C -- Polls --> D;
    A -- Transactions --> D;

    style A fill:#222,stroke:#0f0,stroke-width:2px
    style D fill:#222,stroke:#f90,stroke-width:2px
```

## ⚡ Tech Stack

* **Blockchain**: Solana, Anchor, Rust

* **Backend**: Rust (Axum for API, SQLx for DB, Tokio for async)

* **Frontend**: Next.js, React, TypeScript, Tailwind CSS, Solana Wallet Adapter

* **Database**: PostgreSQL

* **DevOps**: Docker, Yarn, ts-mocha, chai

## 🚀 Local Development Setup
Follow these steps to set up and run the entire AetherNet stack on your local machine.

1. **Prerequisites**
Make sure you have the following installed:

* Node.js (v18 or higher)

* Yarn (npm install -g yarn)

* Rust & Cargo

* Solana CLI

* Anchor CLI

* PostgreSQL Client (psql)

* Docker

## 📦 Sub-Projects
# Indexer (indexer)

A Rust-based indexer that connects to the Solana blockchain, listens for on-chain events, and stores structured data in PostgreSQL.

* Written in Rust with SQLx for database handling

* Ensures efficient synchronization of blockchain state with off-chain storage

* Provides reliable data for the API layer

* github link : [**Indexer Repo**](https://github.com/ktan-wolf/Indexer) 

# Frontend dApp (/frontend)

* A Next.js + TypeScript application serving as the main user interface.

* Built with React, Next.js, TailwindCSS

* Connects directly to Solana wallets and the backend API

* Displays live DePIN data from the indexer

* Designed for scalability and a smooth developer experience

* github link : [**Dapp Repo**](https://github.com/ktan-wolf/Dapp) 
