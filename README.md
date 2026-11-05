# QuickCare AI

I want you to clone this repo and set it up. Repo is https://github.com/Anthonytesla02/PharmEmerg-mobile-redesign



In order not to exceed my API usage when this app goes live, I want us to setup a structure. If any case study or trauma case is the first to be generated, it should be stored in the database globally. All other accounts should share the cases in the database. That is, when the an account generates new cases, they get stored in the database globally. All other accounts will have access to this case along with its solution, which is also stored. When a different account tries generate a new case, it will first check if there are pending cases which that account hasn't solved by comparing it with the users own solved cases. If it finds none, the AI generates a new one. Which also gets saved. Note that, each user's database is separate from the global one. So add user authentication ; make sure the AI generation feature works. 



 





Use my groq api key: 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

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://quickcare-ai.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f17d4ad7-10a4-4a60-b1e1-1a975b3a2da9).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
